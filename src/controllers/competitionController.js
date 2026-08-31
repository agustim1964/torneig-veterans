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
      hora_inici: '09:00:00'
    };
  }

  res.render('competitions/index', { competitions });
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
      (idcompeticio, durada_partit_grups, durada_partit_eliminatories, hora_inici)
    VALUES (?, 20, 25, '09:00:00')
  `, [result.insertId]);

  res.redirect('/competitions');
};

exports.updateConfig = async (req, res) => {
  const id = Number(req.params.id);
  const groupDuration = Math.max(1, Number(req.body.durada_partit_grups || 20));
  const knockoutDuration = Math.max(1, Number(req.body.durada_partit_eliminatories || 25));
  const startTime = req.body.hora_inici || '09:00';

  await db.query(`
    INSERT INTO configuracio_competicio
      (idcompeticio, durada_partit_grups, durada_partit_eliminatories, hora_inici)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      durada_partit_grups = VALUES(durada_partit_grups),
      durada_partit_eliminatories = VALUES(durada_partit_eliminatories),
      hora_inici = VALUES(hora_inici)
  `, [id, groupDuration, knockoutDuration, startTime]);

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
