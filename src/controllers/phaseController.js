const db = require('../config/db');
const { createPhase } = require('../services/phaseService');

async function loadCategory(categoryId) {
  const [[category]] = await db.query(`
    SELECT c.*, comp.nom AS competicio_nom
    FROM categories c
    INNER JOIN competicions comp
      ON comp.idcompeticio = c.idcompeticio
    WHERE c.idcategoria = ?
  `, [categoryId]);

  return category;
}

exports.show = async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const category = await loadCategory(categoryId);

  if (!category) return res.status(404).send('Categoria no trobada.');

  const [groupStatus] = await db.query(`
    SELECT
      g.idgrup,
      g.numero,
      COUNT(p.idpartit) AS partits,
      SUM(CASE WHEN p.estat = 'FINALITZAT' THEN 1 ELSE 0 END) AS finalitzats
    FROM grups g
    LEFT JOIN partits p ON p.idgrup = g.idgrup
    WHERE g.idcategoria = ?
    GROUP BY g.idgrup, g.numero
    ORDER BY g.numero
  `, [categoryId]);

  const groupsFinished =
    groupStatus.length > 0 &&
    groupStatus.every(g =>
      Number(g.partits || 0) > 0 &&
      Number(g.partits || 0) === Number(g.finalitzats || 0)
    );

  const [phases] = await db.query(`
    SELECT *
    FROM fases
    WHERE idcategoria = ?
      AND tipus = 'ELIMINATORIA'
    ORDER BY ordre, idfase
  `, [categoryId]);

  for (const phase of phases) {
    const [rounds] = await db.query(`
      SELECT *
      FROM rondes
      WHERE idfase = ?
      ORDER BY ordre
    `, [phase.idfase]);

    for (const round of rounds) {
      const [matches] = await db.query(`
        SELECT
          p.*,
          p1.nom_mostrar AS participant1_nom,
          p2.nom_mostrar AS participant2_nom,
          w.nom_mostrar AS guanyador_nom
        FROM partits p
        LEFT JOIN participants p1 ON p1.idparticipant = p.participant1
        LEFT JOIN participants p2 ON p2.idparticipant = p.participant2
        LEFT JOIN participants w ON w.idparticipant = p.guanyador
        WHERE p.idronda = ?
        ORDER BY p.numero_partit, p.idpartit
      `, [round.idronda]);

      for (const match of matches) {
        const [games] = await db.query(`
          SELECT numero_joc, punts1, punts2
          FROM partit_jocs
          WHERE idpartit = ?
          ORDER BY numero_joc
        `, [match.idpartit]);

        match.jocs = games;
      }

      round.matches = matches;
    }

    const [[played]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM partits
      WHERE idfase = ?
        AND estat = 'FINALITZAT'
        AND COALESCE(bye,0) = 0
    `, [phase.idfase]);

    phase.locked = Number(played.total || 0) > 0;
    phase.rounds = rounds;

    const [positions] = await db.query(`
      SELECT
        qp.*,
        p.nom_mostrar,
        cf.posicio_grup,
        g.numero AS grup_numero
      FROM quadre_posicions qp
      LEFT JOIN participants p ON p.idparticipant = qp.idparticipant
      LEFT JOIN classificacions_fase cf
        ON cf.idfase_desti = qp.idfase
       AND cf.idparticipant = qp.idparticipant
      LEFT JOIN grups g ON g.idgrup = cf.idgrup
      WHERE qp.idfase = ?
      ORDER BY qp.posicio
    `, [phase.idfase]);

    phase.positions = positions;
  }

  res.render('phases/index', {
    category,
    phases,
    groupsFinished,
    groupStatus
  });
};

exports.generate = async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const kind = String(req.body.kind || '').toUpperCase();

  const category = await loadCategory(categoryId);
  if (!category) return res.status(404).send('Categoria no trobada.');

  if (category.format_competicio === 'GRUP_UNIC') {
    return res.status(400).send(`
      <h1>Aquesta categoria és Top X</h1>
      <p>La classificació del grup únic ja és la classificació final.</p>
      <p><a href="/matches/category/${categoryId}">Tornar</a></p>
    `);
  }

  try {
    await createPhase(categoryId, kind);
    res.redirect(`/phases/category/${categoryId}`);
  } catch (e) {
    res.status(400).send(`
      <div style="font-family:Arial;max-width:760px;margin:40px auto">
        <h1>No s'ha pogut generar el quadre</h1>
        <p>${String(e.message || e)}</p>
        <p><a href="/phases/category/${categoryId}">Tornar a la fase final</a></p>
      </div>
    `);
  }
};
