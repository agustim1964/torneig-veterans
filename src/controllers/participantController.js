const fs = require('fs');
const path = require('path');
const ExcelJS = require('exceljs');
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
    SELECT *
    FROM participants
    WHERE idcategoria = ?
    ORDER BY actiu DESC, baixa ASC, ranking DESC, nom_mostrar
  `, [categoryId]);

  res.render('participants/index', { category, participants });
};

exports.create = async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const { nom_mostrar, ranking } = req.body;

  await db.query(`
    INSERT INTO participants
      (idcategoria, nom_mostrar, ranking)
    VALUES (?, ?, ?)
  `, [
    categoryId,
    String(nom_mostrar || '').trim(),
    Number(ranking || 0)
  ]);

  res.redirect(`/participants/category/${categoryId}`);
};

exports.update = async (req, res) => {
  const id = Number(req.params.id);
  const { nom_mostrar, ranking, categoryId } = req.body;

  await db.query(`
    UPDATE participants
    SET nom_mostrar = ?, ranking = ?
    WHERE idparticipant = ?
  `, [
    String(nom_mostrar || '').trim(),
    Number(ranking || 0),
    id
  ]);

  res.redirect(`/participants/category/${Number(categoryId)}`);
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

async function readXlsx(filePath) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error('El fitxer Excel no conté cap full.');

  const headers = [];
  worksheet.getRow(1).eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = String(normalizeCellValue(cell.value)).trim().toLowerCase();
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
    .map(h => String(h).trim().toLowerCase());

  return lines.slice(1).map(line => {
    const values = parseCsvLine(line, delimiter);
    const obj = {};

    headers.forEach((header, index) => {
      if (header) obj[header] = values[index] ?? '';
    });

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

      for (const raw of rows) {
        const row = {};
        for (const [key, value] of Object.entries(raw)) {
          row[String(key).trim().toLowerCase()] = value;
        }

        const nom = String(row.nom || '').trim();
        const cognoms = String(row.cognoms || '').trim();
        const club = String(row.club || '').trim();
        const sexe = String(row.sexe || '').trim().toUpperCase();
        const llicencia = String(row.llicencia || row.num_llicencia || '').trim();
        const ranking = Number(String(row.ranking ?? '0').replace(',', '.').trim()) || 0;
        const explicitDisplay = String(row.nom_mostrar || '').trim();

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
          }

          if (!playerId) {
            const [result] = await connection.query(`
              INSERT INTO jugadors
                (nom, cognoms, club, sexe, num_llicencia)
              VALUES (?, ?, ?, ?, ?)
            `, [
              nom,
              cognoms || null,
              club || null,
              ['M', 'F'].includes(sexe) ? sexe : null,
              llicencia || null
            ]);
            playerId = result.insertId;
          }
        }

        const [participantResult] = await connection.query(`
          INSERT INTO participants
            (idcategoria, nom_mostrar, ranking)
          VALUES (?, ?, ?)
        `, [categoryId, nomMostrar, ranking]);

        if (playerId) {
          await connection.query(`
            INSERT INTO participant_jugadors
              (idparticipant, idjugador, ordre)
            VALUES (?, ?, 1)
          `, [participantResult.insertId, playerId]);
        }
      }

      await connection.commit();
    } catch (e) {
      await connection.rollback();
      throw e;
    } finally {
      connection.release();
    }

    res.redirect(`/participants/category/${categoryId}`);
  } finally {
    fs.unlink(req.file.path, () => {});
  }
};
