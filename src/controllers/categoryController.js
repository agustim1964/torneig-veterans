const db = require('../config/db');
const { hasFinishedKnockoutMatches, deleteCategoryDraw } = require('../services/categoryResetService');

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
      (idcompeticio, nom, tipus, sexe, edat_minima, format_competicio, mode_taules_grups)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `, [
    Number(req.body.idcompeticio),
    String(req.body.nom || '').trim(),
    req.body.tipus,
    req.body.sexe,
    req.body.edat_minima ? Number(req.body.edat_minima) : null,
    ['AUTO', 'GRUP_UNIC', 'GRUPS_MES_FINAL'].includes(req.body.format_competicio)
      ? req.body.format_competicio
      : 'AUTO',
    req.body.mode_taules_grups === 'MAXIM' ? 'MAXIM' : 'UNA_PER_GRUP'
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

  const cx = await db.getConnection();
  try {
    await cx.beginTransaction();

    const [[stats]] = await cx.query(`
      SELECT COUNT(*) AS finalitzats
      FROM partits pa
      INNER JOIN grups g ON g.idgrup = pa.idgrup
      WHERE g.idcategoria = ? AND pa.estat = 'FINALITZAT'
    `, [id]);

    if (Number(stats.finalitzats || 0) > 0) {
      await cx.rollback();
      return res.status(409).send('No es pot canviar el format: aquesta categoria té partits de grup amb resultats desats. Reinicia primer els partits dels grups.');
    }

    if (await hasFinishedKnockoutMatches(cx, id)) {
      await cx.rollback();
      return res.status(409).send('No es pot canviar el format: aquesta categoria té partits eliminatoris finalitzats amb resultats reals (no BYE). Reinicia primer els resultats de les fases finals.');
    }

    await deleteCategoryDraw(cx, id);
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


exports.updateTableMode = async (req, res) => {
  const id = Number(req.params.id);
  const mode = req.body.mode_taules_grups === 'MAXIM' ? 'MAXIM' : 'UNA_PER_GRUP';

  const [[category]] = await db.query(`
    SELECT idcategoria, idcompeticio
    FROM categories
    WHERE idcategoria = ?
  `, [id]);

  if (!category) return res.status(404).send('Categoria no trobada.');

  await db.query(`
    UPDATE categories
    SET mode_taules_grups = ?
    WHERE idcategoria = ?
  `, [mode, id]);

  res.redirect(`/categories?competitionId=${category.idcompeticio}`);
};
