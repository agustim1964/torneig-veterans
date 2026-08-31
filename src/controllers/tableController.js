const db = require('../config/db');

exports.list = async (req, res) => {
  const [tables] = await db.query(`
    SELECT *
    FROM taules
    ORDER BY numero
  `);

  const [[summary]] = await db.query(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN activa = 1 THEN 1 ELSE 0 END) AS actives
    FROM taules
  `);

  res.render('tables/index', {
    tables,
    total: Number(summary.total || 0),
    active: Number(summary.actives || 0)
  });
};

exports.create = async (req, res) => {
  const numero = Number(req.body.numero);
  const nom = String(req.body.nom || '').trim();
  const observacions = String(req.body.observacions || '').trim();

  if (!Number.isInteger(numero) || numero < 1) {
    return res.status(400).send('El número de taula no és vàlid.');
  }

  await db.query(`
    INSERT INTO taules (numero, nom, activa, observacions)
    VALUES (?, ?, 1, ?)
  `, [
    numero,
    nom || `Taula ${numero}`,
    observacions || null
  ]);

  res.redirect('/tables');
};

exports.update = async (req, res) => {
  const id = Number(req.params.id);
  const numero = Number(req.body.numero);
  const nom = String(req.body.nom || '').trim();
  const observacions = String(req.body.observacions || '').trim();

  await db.query(`
    UPDATE taules
    SET numero = ?, nom = ?, observacions = ?
    WHERE idtaula = ?
  `, [
    numero,
    nom || `Taula ${numero}`,
    observacions || null,
    id
  ]);

  res.redirect('/tables');
};

exports.toggle = async (req, res) => {
  const id = Number(req.params.id);

  await db.query(`
    UPDATE taules
    SET activa = IF(activa = 1, 0, 1)
    WHERE idtaula = ?
  `, [id]);

  res.redirect('/tables');
};

exports.remove = async (req, res) => {
  const id = Number(req.params.id);

  const [[usedInGroups]] = await db.query(`
    SELECT COUNT(*) AS total
    FROM grups
    WHERE idtaula = ?
  `, [id]);

  const [[usedInMatches]] = await db.query(`
    SELECT COUNT(*) AS total
    FROM partits
    WHERE idtaula = ?
  `, [id]);

  if (Number(usedInGroups.total) > 0 || Number(usedInMatches.total) > 0) {
    return res.status(400).send(`
      <h1>No es pot eliminar</h1>
      <p>Aquesta taula ja està assignada a un grup o partit.</p>
      <p>La pots desactivar sense perdre l'històric.</p>
      <p><a href="/tables">Tornar a Taules</a></p>
    `);
  }

  await db.query('DELETE FROM taules WHERE idtaula = ?', [id]);
  res.redirect('/tables');
};

exports.configureCount = async (req, res) => {
  const count = Number(req.body.count);

  if (!Number.isInteger(count) || count < 0 || count > 500) {
    return res.status(400).send('Nombre de taules no vàlid.');
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.query(`
      SELECT idtaula, numero, activa
      FROM taules
      ORDER BY numero
    `);

    const byNumber = new Map(existing.map(t => [Number(t.numero), t]));

    for (let numero = 1; numero <= count; numero++) {
      const current = byNumber.get(numero);

      if (!current) {
        await connection.query(`
          INSERT INTO taules (numero, nom, activa)
          VALUES (?, ?, 1)
        `, [numero, `Taula ${numero}`]);
      } else {
        await connection.query(`
          UPDATE taules
          SET activa = 1
          WHERE idtaula = ?
        `, [current.idtaula]);
      }
    }

    await connection.query(`
      UPDATE taules
      SET activa = 0
      WHERE numero > ?
    `, [count]);

    await connection.query(`
      INSERT INTO log_canvis
        (accio, entitat, descripcio)
      VALUES ('CONFIGURAR_TAULES', 'taules', ?)
    `, [`Nombre de taules actives configurat a ${count}`]);

    await connection.commit();
    res.redirect('/tables');
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
};
