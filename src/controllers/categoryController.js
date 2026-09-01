const db = require('../config/db');

exports.list = async (req, res) => {
  let competitionId = Number(req.query.competitionId || 0);

  if (!competitionId) {
    const [[first]] = await db.query(`
      SELECT idcompeticio FROM competicions
      WHERE activa = 1
      ORDER BY idcompeticio DESC LIMIT 1
    `);
    competitionId = Number(first?.idcompeticio || 0);
  }

  let competition = null;
  let categories = [];

  if (competitionId) {
    [[competition]] = await db.query(
      'SELECT * FROM competicions WHERE idcompeticio = ?',
      [competitionId]
    );

    [categories] = await db.query(`
      SELECT c.*, COUNT(p.idparticipant) AS participants
      FROM categories c
      LEFT JOIN participants p
        ON p.idcategoria = c.idcategoria
       AND p.actiu = 1
       AND p.baixa = 0
      WHERE c.idcompeticio = ?
      GROUP BY c.idcategoria
      ORDER BY c.tipus, c.sexe, c.edat_minima, c.nom
    `, [competitionId]);
  }

  const [competitions] = await db.query(`
    SELECT idcompeticio, nom
    FROM competicions
    WHERE activa = 1
    ORDER BY nom
  `);

  res.render('categories/index', {
    categories, competitions, competition, competitionId
  });
};

exports.create = async (req, res) => {
  await db.query(`
    INSERT INTO categories
      (idcompeticio, nom, tipus, sexe, edat_minima, format_competicio)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    Number(req.body.idcompeticio),
    String(req.body.nom || '').trim(),
    req.body.tipus,
    req.body.sexe,
    req.body.edat_minima ? Number(req.body.edat_minima) : null,
    ['AUTO', 'GRUP_UNIC', 'GRUPS_MES_FINAL'].includes(req.body.format_competicio)
      ? req.body.format_competicio
      : 'AUTO'
  ]);

  res.redirect(`/categories?competitionId=${Number(req.body.idcompeticio)}`);
};

exports.detail = async (req, res) => {
  const id = Number(req.params.id);
  const [[category]] = await db.query(
    'SELECT * FROM categories WHERE idcategoria = ?',
    [id]
  );
  if (!category) return res.status(404).send('Categoria no trobada');
  res.redirect(`/participants/category/${id}`);
};


exports.updateFormat = async (req, res) => {
  const id = Number(req.params.id);
  const format = String(req.body.format_competicio || 'AUTO');

  if (!['AUTO', 'GRUP_UNIC', 'GRUPS_MES_FINAL'].includes(format)) {
    return res.status(400).send('Format de competició no vàlid.');
  }

  const [[category]] = await db.query(
    'SELECT idcategoria, idcompeticio, format_competicio FROM categories WHERE idcategoria = ?',
    [id]
  );
  if (!category) return res.status(404).send('Categoria no trobada.');

  const [[stats]] = await db.query(`
    SELECT
      COUNT(pa.idpartit) AS total_partits,
      SUM(CASE WHEN pa.estat = 'FINALITZAT' THEN 1 ELSE 0 END) AS finalitzats
    FROM grups g
    LEFT JOIN partits pa ON pa.idgrup = g.idgrup
    WHERE g.idcategoria = ?
  `, [id]);

  if (Number(stats.total_partits || 0) > 0) {
    return res.status(409).send(`
      <div style="font-family:Arial;max-width:760px;margin:40px auto">
        <h1>No es pot canviar el format encara</h1>
        <p>Aquesta categoria ja té partits generats${Number(stats.finalitzats || 0) > 0 ? ' i alguns tenen resultat' : ''}.</p>
        <p>Elimina o reinicia primer els partits abans de canviar entre Top X i grups + eliminatòries.</p>
        <p><a href="/categories?competitionId=${category.idcompeticio}">Tornar a categories</a></p>
      </div>
    `);
  }

  const cx = await db.getConnection();
  try {
    await cx.beginTransaction();

    // Si hi havia un sorteig sense partits, el descartem perquè el nou format
    // requereix reconstruir els grups de forma coherent.
    const [groups] = await cx.query(
      'SELECT idgrup FROM grups WHERE idcategoria = ?',
      [id]
    );
    if (groups.length) {
      const ids = groups.map(g => g.idgrup);
      const ph = ids.map(() => '?').join(',');
      await cx.query(`DELETE FROM grup_participants WHERE idgrup IN (${ph})`, ids);
      await cx.query('DELETE FROM grups WHERE idcategoria = ?', [id]);
    }

    await cx.query(`
      UPDATE categories
      SET format_competicio = ?, estat = 'PREPARACIO'
      WHERE idcategoria = ?
    `, [format, id]);

    await cx.query(`
      INSERT INTO log_canvis
        (accio, entitat, identitat, descripcio)
      VALUES ('CANVI_FORMAT_CATEGORIA', 'categoria', ?, ?)
    `, [id, `Format de competició canviat a ${format}`]);

    await cx.commit();
  } catch (e) {
    await cx.rollback();
    throw e;
  } finally {
    cx.release();
  }

  res.redirect(`/categories?competitionId=${category.idcompeticio}`);
};
