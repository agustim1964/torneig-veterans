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
      (idcompeticio, nom, tipus, sexe, edat_minima)
    VALUES (?, ?, ?, ?, ?)
  `, [
    Number(req.body.idcompeticio),
    String(req.body.nom || '').trim(),
    req.body.tipus,
    req.body.sexe,
    req.body.edat_minima ? Number(req.body.edat_minima) : null
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
