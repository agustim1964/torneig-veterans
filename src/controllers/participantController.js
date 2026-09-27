const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const db = require('../config/db');

async function getCategory(id) {
  const [[category]] = await db.query(
    'SELECT * FROM categories WHERE idcategoria = ?',
    [id]
  );
  return category;
}

exports.listByCategory = async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const category = await getCategory(categoryId);

  if (!category) return res.status(404).send('Categoria no trobada');

  const [participants] = await db.query(`
    SELECT
      p.*,
      (
        SELECT DATE_FORMAT(j.data_naixement, '%d/%m/%Y')
        FROM participant_jugadors pj
        INNER JOIN jugadors j ON j.idjugador = pj.idjugador
        WHERE pj.idparticipant = p.idparticipant
        ORDER BY pj.ordre
        LIMIT 1
      ) AS data_naixement
    FROM participants p
    WHERE p.idcategoria = ?
    ORDER BY p.actiu DESC, p.baixa ASC, p.ranking DESC, p.nom_mostrar
  `, [categoryId]);

  res.render('participants/index', {
    category,
    participants,
    importSummary: {
      imported: Number(req.query.imported || 0),
      inactive: Number(req.query.inactive || 0)
    }
  });
};

exports.create = async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const { nom_mostrar, ranking, club, pais } = req.body;

  await db.query(`
    INSERT INTO participants
      (idcategoria, nom_mostrar, club, pais, ranking)
    VALUES (?, ?, ?, ?, ?)
  `, [
    categoryId,
    String(nom_mostrar || '').trim(),
    String(club || '').trim() || null,
    String(pais || '').trim().toUpperCase() || null,
    Number(ranking || 0)
  ]);

  res.redirect(`/participants/category/${categoryId}`);
};

exports.edit = async (req, res) => {
  const id = Number(req.params.id);
  const [[participant]] = await db.query(
    'SELECT * FROM participants WHERE idparticipant = ?',
    [id]
  );

  if (!participant) return res.status(404).send('Participant no trobat');

  const category = await getCategory(participant.idcategoria);
  const [players] = await db.query(`
    SELECT
      j.idjugador,
      j.nom,
      j.cognoms,
      DATE_FORMAT(j.data_naixement, '%Y-%m-%d') AS data_naixement,
      j.club,
      j.pais,
      j.sexe,
      j.num_llicencia,
      pj.ordre
    FROM participant_jugadors pj
    INNER JOIN jugadors j ON j.idjugador = pj.idjugador
    WHERE pj.idparticipant = ?
    ORDER BY pj.ordre, j.idjugador
  `, [id]);

  res.render('participants/edit', { category, participant, players });
};

function asArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

exports.update = async (req, res) => {
  const id = Number(req.params.id);
  const { nom_mostrar, ranking, club, pais, actiu } = req.body;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[participant]] = await connection.query(
      'SELECT idcategoria FROM participants WHERE idparticipant = ? FOR UPDATE',
      [id]
    );

    if (!participant) {
      await connection.rollback();
      return res.status(404).send('Participant no trobat');
    }

    await connection.query(`
      UPDATE participants
      SET nom_mostrar = ?, club = ?, pais = ?, ranking = ?, actiu = ?
      WHERE idparticipant = ?
    `, [
      String(nom_mostrar || '').trim(),
      String(club || '').trim() || null,
      String(pais || '').trim().toUpperCase() || null,
      Number(ranking || 0),
      Number(actiu) === 1 ? 1 : 0,
      id
    ]);

    const playerIds = asArray(req.body.player_id);
    const playerNames = asArray(req.body.player_nom);
    const playerSurnames = asArray(req.body.player_cognoms);
    const playerBirthDates = asArray(req.body.player_data_naixement);
    const playerClubs = asArray(req.body.player_club);
    const playerCountries = asArray(req.body.player_pais);
    const playerSexes = asArray(req.body.player_sexe);
    const playerLicences = asArray(req.body.player_num_llicencia);

    for (let index = 0; index < playerIds.length; index++) {
      const playerId = Number(playerIds[index]);
      if (!playerId) continue;

      await connection.query(`
        UPDATE jugadors j
        INNER JOIN participant_jugadors pj
          ON pj.idjugador = j.idjugador
         AND pj.idparticipant = ?
        SET j.nom = ?,
            j.cognoms = ?,
            j.data_naixement = ?,
            j.club = ?,
            j.pais = ?,
            j.sexe = ?,
            j.num_llicencia = ?
        WHERE j.idjugador = ?
      `, [
        id,
        String(playerNames[index] || '').trim(),
        String(playerSurnames[index] || '').trim() || null,
        String(playerBirthDates[index] || '').trim() || null,
        String(playerClubs[index] || '').trim() || null,
        String(playerCountries[index] || '').trim().toUpperCase() || null,
        ['M', 'F'].includes(String(playerSexes[index] || '').toUpperCase())
          ? String(playerSexes[index]).toUpperCase()
          : null,
        String(playerLicences[index] || '').trim() || null,
        playerId
      ]);
    }

    await connection.commit();
    res.redirect(`/participants/category/${participant.idcategoria}`);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

exports.toggleActive = async (req, res) => {
  const id = Number(req.params.id);
  const categoryId = Number(req.body.categoryId);

  await db.query(`
    UPDATE participants
    SET actiu = IF(actiu = 1, 0, 1)
    WHERE idparticipant = ?
  `, [id]);

  res.redirect(`/participants/category/${categoryId}`);
};

function normalizeCellValue(value) {
  if (value === null || value === undefined) return '';

  if (typeof value === 'object') {
    if (Object.prototype.hasOwnProperty.call(value, 'text')) return value.text;
    if (Object.prototype.hasOwnProperty.call(value, 'result')) return value.result;
    if (Array.isArray(value.richText)) {
      return value.richText.map(part => part.text || '').join('');
    }
  }

  return value;
}

function parseCsvLine(line, delimiter) {
  const values = [];
  let current = '';
  let quoted = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      values.push(current);
      current = '';
    } else {
      current += ch;
    }
  }

  values.push(current);
  return values;
}

function normalizeHeader(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function formatDateParts(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0')
  ].join('-');
}

function parseBirthDate(value) {
  value = normalizeCellValue(value);
  if (value === null || value === undefined || String(value).trim() === '') return null;

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return formatDateParts(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate()
    );
  }

  if (typeof value === 'number' || /^\d+(?:[.,]\d+)?$/.test(String(value).trim())) {
    const serial = Number(String(value).replace(',', '.'));
    if (Number.isFinite(serial) && serial >= 10000 && serial <= 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000));
      return formatDateParts(
        date.getUTCFullYear(),
        date.getUTCMonth() + 1,
        date.getUTCDate()
      );
    }
  }

  const text = String(value).trim();
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (match) return formatDateParts(Number(match[1]), Number(match[2]), Number(match[3]));

  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/);
  if (match) return formatDateParts(Number(match[3]), Number(match[2]), Number(match[1]));

  return null;
}

function parseActive(value) {
  value = normalizeCellValue(value);
  if (value === null || value === undefined || String(value).trim() === '') return 1;
  if (value === true || value === 1) return 1;
  if (value === false || value === 0) return 0;

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (['1', 'si', 's', 'true', 'actiu', 'activa', 'activo', 'active'].includes(normalized)) {
    return 1;
  }
  if (['0', 'no', 'n', 'false', 'inactiu', 'inactiva', 'inactivo', 'inactive'].includes(normalized)) {
    return 0;
  }

  return null;
}

function firstDefined(row, names) {
  for (const name of names) {
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  }
  return '';
}

async function loadXlsxWorkbook(filePath) {
  const originalBuffer = fs.readFileSync(filePath);
  let workbook = new ExcelJS.Workbook();

  try {
    await workbook.xlsx.load(originalBuffer);
    return workbook;
  } catch (originalError) {
    const zip = await JSZip.loadAsync(originalBuffer);
    const xmlFiles = Object.keys(zip.files).filter(name => name.endsWith('.xml'));
    let changed = false;

    for (const fileName of xmlFiles) {
      const file = zip.file(fileName);
      if (!file) continue;

      let xml = await file.async('string');
      const rootMatch = xml.match(/<([A-Za-z_][\w.-]*):(workbook|worksheet|styleSheet|sst)\b/);
      if (!rootMatch) continue;

      const prefix = rootMatch[1];
      const tagPrefix = new RegExp(`<(/?)${prefix}:`, 'g');
      const namespacePrefix = new RegExp(`xmlns:${prefix}=`);
      xml = xml.replace(tagPrefix, '<$1').replace(namespacePrefix, 'xmlns=');
      zip.file(fileName, xml);
      changed = true;
    }

    if (!changed) throw originalError;

    const compatibleBuffer = await zip.generateAsync({ type: 'nodebuffer' });
    workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(compatibleBuffer);
    return workbook;
  }
}

async function readXlsx(filePath) {
  const workbook = await loadXlsxWorkbook(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('El fitxer Excel no conté cap full.');

  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = normalizeHeader(normalizeCellValue(cell.value));
  });

  const rows = [];
  worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;

    const obj = {};
    headers.forEach((header, colNumber) => {
      if (!header) return;
      obj[header] = normalizeCellValue(row.getCell(colNumber).value);
    });

    if (Object.values(obj).some(v => String(v ?? '').trim() !== '')) {
      obj.__rowNumber = rowNumber;
      rows.push(obj);
    }
  });

  return rows;
}

function readCsv(filePath) {
  const csvText = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');

  if (!lines.length) throw new Error('El fitxer CSV està buit.');

  const delimiter = lines[0].includes(';') ? ';' : ',';
  const headers = parseCsvLine(lines[0], delimiter)
    .map(normalizeHeader);

  return lines.slice(1).map((line, lineIndex) => {
    const values = parseCsvLine(line, delimiter);
    const obj = {};

    headers.forEach((header, index) => {
      if (header) obj[header] = values[index] ?? '';
    });

    obj.__rowNumber = lineIndex + 2;

    return obj;
  });
}

exports.importFile = async (req, res) => {
  const categoryId = Number(req.params.categoryId);

  if (!req.file) {
    return res.status(400).send('No s\'ha rebut cap fitxer.');
  }

  const extension = path.extname(req.file.originalname || '').toLowerCase();

  try {
    let rows;

    if (extension === '.xlsx') {
      rows = await readXlsx(req.file.path);
    } else if (extension === '.csv') {
      rows = readCsv(req.file.path);
    } else {
      return res.status(400).send('Format no admès. Utilitza fitxers .xlsx o .csv.');
    }

    const connection = await db.getConnection();

    try {
      await connection.beginTransaction();

      let imported = 0;
      let inactive = 0;

      for (const raw of rows) {
        const row = {};
        const sourceRow = Number(raw.__rowNumber || 0);
        for (const [key, value] of Object.entries(raw)) {
          if (key.startsWith('__')) continue;
          row[normalizeHeader(key)] = value;
        }

        const nom = String(row.nom || '').trim();
        const cognoms = String(row.cognoms || '').trim();
        const club = String(row.club || '').trim();
        const sexe = String(row.sexe || '').trim().toUpperCase();
        const pais = String(row.pais || row.country || row.nacio || '').trim().toUpperCase();
        const llicencia = String(row.llicencia || row.num_llicencia || '').trim();
        const ranking = Number(String(row.ranking ?? '0').replace(',', '.').trim()) || 0;
        const explicitDisplay = String(row.nom_mostrar || '').trim();
        const birthDateValue = firstDefined(row, [
          'data_naixement', 'data_de_naixement', 'fecha_nacimiento',
          'birth_date', 'date_of_birth', 'naixement'
        ]);
        const activeValue = firstDefined(row, [
          'actiu', 'activa', 'activo', 'active', 'estat'
        ]);
        const dataNaixement = parseBirthDate(birthDateValue);
        const actiu = parseActive(activeValue);

        if (String(normalizeCellValue(birthDateValue) ?? '').trim() && !dataNaixement) {
          throw new Error(`Fila ${sourceRow || '?'}: data de naixement no vàlida.`);
        }
        if (actiu === null) {
          throw new Error(`Fila ${sourceRow || '?'}: el camp actiu ha de ser 1/0, sí/no o actiu/inactiu.`);
        }

        const nomMostrar = explicitDisplay ||
          [nom, cognoms].filter(Boolean).join(' ').trim();

        if (!nomMostrar) continue;

        let playerId = null;

        if (nom) {
          if (llicencia) {
            const [[existing]] = await connection.query(
              'SELECT idjugador FROM jugadors WHERE num_llicencia = ? LIMIT 1',
              [llicencia]
            );
            playerId = existing?.idjugador || null;
            if (playerId) {
              await connection.query(`
                UPDATE jugadors
                SET club = COALESCE(NULLIF(?, ''), club),
                    pais = COALESCE(NULLIF(?, ''), pais),
                    data_naixement = COALESCE(?, data_naixement)
                WHERE idjugador = ?
              `, [club, pais, dataNaixement, playerId]);
            }
          }

          if (!playerId) {
            const [result] = await connection.query(`
              INSERT INTO jugadors
                (nom, cognoms, data_naixement, club, pais, sexe, num_llicencia)
              VALUES (?, ?, ?, ?, ?, ?, ?)
            `, [
              nom,
              cognoms || null,
              dataNaixement,
              club || null,
              pais || null,
              ['M', 'F'].includes(sexe) ? sexe : null,
              llicencia || null
            ]);
            playerId = result.insertId;
          }
        }

        const [participantResult] = await connection.query(`
          INSERT INTO participants
            (idcategoria, nom_mostrar, club, pais, ranking, actiu)
          VALUES (?, ?, ?, ?, ?, ?)
        `, [categoryId, nomMostrar, club || null, pais || null, ranking, actiu]);

        if (playerId) {
          await connection.query(`
            INSERT INTO participant_jugadors
              (idparticipant, idjugador, ordre)
            VALUES (?, ?, 1)
          `, [participantResult.insertId, playerId]);
        }

        imported++;
        if (!actiu) inactive++;
      }

      await connection.commit();

      return res.redirect(
        `/participants/category/${categoryId}?imported=${imported}&inactive=${inactive}`
      );
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }
  } finally {
    fs.unlink(req.file.path, () => {});
  }
};

exports._test = {
  normalizeHeader,
  parseBirthDate,
  parseActive,
  readXlsx,
  readCsv
};
