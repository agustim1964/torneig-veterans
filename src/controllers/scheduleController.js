const db = require('../config/db');
const { generateMaster, isoDate } = require('../services/scheduleService');

async function getCompetition(id) {
  const [[competition]] = await db.query(`
    SELECT c.*, cc.durada_partit_grups, cc.hora_inici
    FROM competicions c
    LEFT JOIN configuracio_competicio cc ON cc.idcompeticio = c.idcompeticio
    WHERE c.idcompeticio = ?
  `, [id]);
  return competition;
}

exports.show = async (req, res) => {
  const id = Number(req.params.competitionId);
  const competition = await getCompetition(id);
  if (!competition) return res.status(404).send('Competició no trobada.');

  const [tables] = await db.query(`SELECT * FROM taules WHERE activa = 1 ORDER BY numero`);
  const [rows] = await db.query(`
    SELECT
      pg.*,
      g.numero AS grup_numero,
      cat.nom AS categoria_nom,
      cat.idcategoria,
      t.numero AS taula_numero,
      t.nom AS taula_nom,
      (SELECT COUNT(*) FROM grup_participants x WHERE x.idgrup = g.idgrup) AS participants_grup
    FROM programacio_grups pg
    INNER JOIN grups g ON g.idgrup = pg.idgrup
    INNER JOIN categories cat ON cat.idcategoria = g.idcategoria
    INNER JOIN taules t ON t.idtaula = pg.idtaula
    WHERE cat.idcompeticio = ?
    ORDER BY pg.data, pg.hora_inici, t.numero, cat.nom, g.numero
  `, [id]);

  const dates = [...new Set(rows.map(r => isoDate(r.data)).filter(Boolean))];
  const defaultDate = isoDate(req.query.data || competition.data_inici || new Date());

  res.render('schedule/index', { competition, tables, rows, dates, defaultDate, isoDate });
};

exports.generate = async (req, res) => {
  const id = Number(req.params.competitionId);
  const competition = await getCompetition(id);
  if (!competition) return res.status(404).send('Competició no trobada.');

  const planDate = req.body.data || isoDate(competition.data_inici || new Date());
  const [tables] = await db.query(`SELECT * FROM taules WHERE activa = 1 ORDER BY numero`);
  const [groups] = await db.query(`
    SELECT
      g.idgrup,
      (COUNT(gp.idparticipant) * (COUNT(gp.idparticipant) - 1)) / 2 AS nombre_partits
    FROM grups g
    INNER JOIN categories cat ON cat.idcategoria = g.idcategoria
    INNER JOIN grup_participants gp ON gp.idgrup = g.idgrup
    WHERE cat.idcompeticio = ?
    GROUP BY g.idgrup
    ORDER BY cat.nom, g.numero
  `, [id]);

  const [locked] = await db.query(`
    SELECT pg.*
    FROM programacio_grups pg
    INNER JOIN grups g ON g.idgrup = pg.idgrup
    INNER JOIN categories cat ON cat.idcategoria = g.idcategoria
    WHERE cat.idcompeticio = ? AND pg.bloquejada = 1
  `, [id]);

  const plan = generateMaster(
    groups,
    tables,
    planDate,
    competition.hora_inici || '09:00:00',
    Number(competition.durada_partit_grups || 20),
    locked
  );

  const cx = await db.getConnection();
  try {
    await cx.beginTransaction();

    await cx.query(`
      DELETE pg
      FROM programacio_grups pg
      INNER JOIN grups g ON g.idgrup = pg.idgrup
      INNER JOIN categories cat ON cat.idcategoria = g.idcategoria
      WHERE cat.idcompeticio = ? AND pg.bloquejada = 0
    `, [id]);

    for (const row of plan) {
      await cx.query(`
        INSERT INTO programacio_grups
          (idgrup, idtaula, data, hora_inici, hora_final, durada_partit, bloquejada)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `, [row.idgrup, row.idtaula, row.data, row.hora_inici, row.hora_final, row.durada_partit]);
    }

    await cx.commit();
    res.redirect(`/schedule/competition/${id}`);
  } catch (e) {
    await cx.rollback();
    throw e;
  } finally {
    cx.release();
  }
};

exports.update = async (req, res) => {
  await db.query(`
    UPDATE programacio_grups
    SET data = ?, idtaula = ?, hora_inici = ?, hora_final = ?, bloquejada = ?
    WHERE idprogramacio = ?
  `, [
    req.body.data,
    Number(req.body.idtaula),
    req.body.hora_inici,
    req.body.hora_final,
    req.body.bloquejada ? 1 : 0,
    Number(req.params.id)
  ]);

  res.redirect(`/schedule/competition/${Number(req.body.competitionId)}`);
};


function minutesFromTime(value) {
  if (!value) return null;
  const [h, m] = String(value).substring(0, 5).split(':').map(Number);
  return h * 60 + m;
}

function hhmm(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

exports.print = async (req, res) => {
  const id = Number(req.params.competitionId);
  const competition = await getCompetition(id);
  if (!competition) return res.status(404).send('Competició no trobada.');

  const [tables] = await db.query(`
    SELECT *
    FROM taules
    WHERE activa = 1
    ORDER BY numero
  `);

  const [rows] = await db.query(`
    SELECT
      pg.*,
      g.numero AS grup_numero,
      cat.nom AS categoria_nom,
      t.numero AS taula_numero,
      t.nom AS taula_nom
    FROM programacio_grups pg
    INNER JOIN grups g ON g.idgrup = pg.idgrup
    INNER JOIN categories cat ON cat.idcategoria = g.idcategoria
    INNER JOIN taules t ON t.idtaula = pg.idtaula
    WHERE cat.idcompeticio = ?
    ORDER BY pg.data, pg.hora_inici, t.numero
  `, [id]);

  const byDate = new Map();

  for (const row of rows) {
    const date = isoDate(row.data);
    if (!date) continue;
    if (!byDate.has(date)) byDate.set(date, []);
    byDate.get(date).push(row);
  }

  const days = [];

  for (const [date, dayRows] of byDate.entries()) {
    // La graella utilitza la durada de grup més petita del dia.
    // Normalment seran 20 minuts.
    const step = Math.max(
      5,
      Math.min(...dayRows.map(r => Number(r.durada_partit || competition.durada_partit_grups || 20)))
    );

    const start = Math.min(...dayRows.map(r => minutesFromTime(r.hora_inici)));
    const end = Math.max(...dayRows.map(r => minutesFromTime(r.hora_final)));

    const slots = [];

    for (let minute = start; minute < end; minute += step) {
      const cells = tables.map(table => {
        const item = dayRows.find(r => {
          if (Number(r.idtaula) !== Number(table.idtaula)) return false;
          const a = minutesFromTime(r.hora_inici);
          const b = minutesFromTime(r.hora_final);
          return minute >= a && minute < b;
        });

        return item ? {
          categoria: item.categoria_nom,
          fase: `G${item.grup_numero}`,
          tipus: 'GRUP'
        } : null;
      });

      slots.push({
        hora: hhmm(minute),
        cells
      });
    }

    days.push({ date, slots });
  }

  res.render('schedule/print', {
    competition,
    tables,
    days
  });
};
