const db = require('../config/db');

exports.list = async (req, res) => {
  const [competitions] = await db.query(`
    SELECT c.*, COUNT(cat.idcategoria) AS categories
    FROM competicions c
    LEFT JOIN categories cat ON cat.idcompeticio = c.idcompeticio
    GROUP BY c.idcompeticio
    ORDER BY c.activa DESC, c.data_inici DESC, c.nom
  `);
  for (const competition of competitions) {
    const [[config]] = await db.query(`
      SELECT *
      FROM configuracio_competicio
      WHERE idcompeticio = ?
    `, [competition.idcompeticio]);

    competition.config = config || {
      durada_partit_grups: 20,
      durada_partit_eliminatories: 25,
      hora_inici: '09:00:00',
      hora_fi_jornada: '20:00:00',
      nombre_taules_disponibles: 20,
      tipus_arbitratge: 'JUGADORS'
    };
  }

  res.render('competitions/index', { competitions });
};

exports.participantList = async (req, res) => {
  const id = Number(req.params.id);
  const [[competition]] = await db.query(
    'SELECT * FROM competicions WHERE idcompeticio = ?',
    [id]
  );

  if (!competition) return res.status(404).send('Competició no trobada');

  const [rows] = await db.query(`
    SELECT
      c.idcategoria,
      c.nom AS categoria_nom,
      c.tipus,
      c.sexe,
      c.edat_minima,
      p.idparticipant,
      p.nom_mostrar,
      (
        SELECT GROUP_CONCAT(NULLIF(j.num_llicencia, '') ORDER BY pj.ordre SEPARATOR ' / ')
        FROM participant_jugadors pj
        INNER JOIN jugadors j ON j.idjugador = pj.idjugador
        WHERE pj.idparticipant = p.idparticipant
      ) AS dorsal,
      p.pais,
      p.ranking,
      p.actiu,
      p.baixa
    FROM categories c
    LEFT JOIN participants p ON p.idcategoria = c.idcategoria
    WHERE c.idcompeticio = ?
    ORDER BY
      c.tipus,
      c.sexe,
      c.edat_minima,
      c.nom,
      p.actiu DESC,
      p.baixa ASC,
      p.ranking DESC,
      p.nom_mostrar
  `, [id]);

  const categoryMap = new Map();

  for (const row of rows) {
    if (!categoryMap.has(row.idcategoria)) {
      categoryMap.set(row.idcategoria, {
        idcategoria: row.idcategoria,
        nom: row.categoria_nom,
        tipus: row.tipus,
        sexe: row.sexe,
        edat_minima: row.edat_minima,
        participants: [],
        activeCount: 0,
        inactiveCount: 0
      });
    }

    if (!row.idparticipant) continue;

    const category = categoryMap.get(row.idcategoria);
    const isActive = Boolean(row.actiu) && !Boolean(row.baixa);
    category.participants.push({
      idparticipant: row.idparticipant,
      nom_mostrar: row.nom_mostrar,
      dorsal: row.dorsal,
      pais: row.pais,
      ranking: row.ranking,
      isActive
    });

    if (isActive) category.activeCount++;
    else category.inactiveCount++;
  }

  res.render('competitions/participant-list', {
    competition,
    categories: Array.from(categoryMap.values())
  });
};

exports.groupList = async (req, res) => {
  const id = Number(req.params.id);
  const [[competition]] = await db.query(
    'SELECT * FROM competicions WHERE idcompeticio = ?', [id]
  );
  if (!competition) return res.status(404).send('Competició no trobada');

  const [rows] = await db.query(`
    SELECT c.idcategoria, c.nom AS categoria_nom,
      g.idgrup, g.numero, g.nom AS grup_nom,
      p.idparticipant, p.nom_mostrar, p.club, p.pais
    FROM categories c
    LEFT JOIN grups g ON g.idcategoria = c.idcategoria
    LEFT JOIN grup_participants gp ON gp.idgrup = g.idgrup
    LEFT JOIN participants p ON p.idparticipant = gp.idparticipant
    WHERE c.idcompeticio = ?
    ORDER BY c.tipus, c.sexe, c.edat_minima, c.nom,
      g.numero, g.idgrup, gp.ordre_visual, gp.posicio_sorteig, p.nom_mostrar
  `, [id]);

  const categoryMap = new Map();
  const groupMap = new Map();
  for (const row of rows) {
    if (!categoryMap.has(row.idcategoria)) {
      categoryMap.set(row.idcategoria, { nom: row.categoria_nom, groups: [] });
    }
    if (!row.idgrup) continue;
    if (!groupMap.has(row.idgrup)) {
      const group = { numero: row.numero, nom: row.grup_nom, participants: [] };
      groupMap.set(row.idgrup, group);
      categoryMap.get(row.idcategoria).groups.push(group);
    }
    if (row.idparticipant) groupMap.get(row.idgrup).participants.push(row);
  }
  res.render('competitions/group-list', {
    competition, categories: Array.from(categoryMap.values())
  });
};

exports.create = async (req, res) => {
  const nom = String(req.body.nom || '').trim();
  if (!nom) return res.status(400).send('El nom de la competició és obligatori.');

  const [result] = await db.query(`
    INSERT INTO competicions
      (nom, data_inici, data_fi, lloc, activa, observacions)
    VALUES (?, ?, ?, ?, 1, ?)
  `, [
    nom,
    req.body.data_inici || null,
    req.body.data_fi || null,
    String(req.body.lloc || '').trim() || null,
    String(req.body.observacions || '').trim() || null
  ]);

  await db.query(`
    INSERT INTO configuracio_competicio
      (idcompeticio, durada_partit_grups, durada_partit_eliminatories, hora_inici, hora_fi_jornada,
       nombre_taules_disponibles, tipus_arbitratge)
    VALUES (?, 20, 25, '09:00:00', '20:00:00', 20, 'JUGADORS')
  `, [result.insertId]);

  res.redirect('/competitions');
};

exports.updateConfig = async (req, res) => {
  const id = Number(req.params.id);
  const groupDuration = Math.max(1, Number(req.body.durada_partit_grups || 20));
  const knockoutDuration = Math.max(1, Number(req.body.durada_partit_eliminatories || 25));
  const startTime = req.body.hora_inici || '09:00';
  const endTime = req.body.hora_fi_jornada || '20:00';
  const availableTables = Math.max(1, Number(req.body.nombre_taules_disponibles || 1));
  const refereeType = req.body.tipus_arbitratge === 'EXTERNS' ? 'EXTERNS' : 'JUGADORS';

  await db.query(`
    INSERT INTO configuracio_competicio
      (idcompeticio, durada_partit_grups, durada_partit_eliminatories, hora_inici, hora_fi_jornada,
       nombre_taules_disponibles, tipus_arbitratge)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      durada_partit_grups = VALUES(durada_partit_grups),
      durada_partit_eliminatories = VALUES(durada_partit_eliminatories),
      hora_inici = VALUES(hora_inici),
      hora_fi_jornada = VALUES(hora_fi_jornada),
      nombre_taules_disponibles = VALUES(nombre_taules_disponibles),
      tipus_arbitratge = VALUES(tipus_arbitratge)
  `, [id, groupDuration, knockoutDuration, startTime, endTime, availableTables, refereeType]);

  res.redirect('/competitions');
};

exports.toggle = async (req, res) => {
  await db.query(`
    UPDATE competicions
    SET activa = IF(activa = 1, 0, 1)
    WHERE idcompeticio = ?
  `, [Number(req.params.id)]);
  res.redirect('/competitions');
};
