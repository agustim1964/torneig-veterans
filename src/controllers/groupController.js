const db = require('../config/db');
const { drawGroups, groupWarnings } = require('../services/drawService');

async function loadCategory(categoryId) {
  const [[category]] = await db.query(
    'SELECT * FROM categories WHERE idcategoria = ?',
    [categoryId]
  );
  return category;
}

exports.showByCategory = async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const category = await loadCategory(categoryId);

  if (!category) return res.status(404).send('Categoria no trobada');

  const [groups] = await db.query(`
    SELECT *
    FROM grups
    WHERE idcategoria = ?
    ORDER BY numero
  `, [categoryId]);

  for (const group of groups) {
    const [participants] = await db.query(`
      SELECT
        gp.idgrupparticipant,
        gp.ordre_visual,
        p.idparticipant,
        p.nom_mostrar,
        p.ranking,
        p.club,
        p.pais
      FROM grup_participants gp
      INNER JOIN participants p
        ON p.idparticipant = gp.idparticipant
      WHERE gp.idgrup = ?
      ORDER BY gp.ordre_visual, p.ranking DESC, p.nom_mostrar
    `, [group.idgrup]);

    group.participants = participants;
    group.warnings = groupWarnings(group);
  }

  res.render('groups/index', { category, groups });
};

exports.draw = async (req, res) => {
  const categoryId = Number(req.params.categoryId);

  const [participants] = await db.query(`
    SELECT idparticipant, nom_mostrar, ranking, club, pais
    FROM participants
    WHERE idcategoria = ?
      AND actiu = 1
      AND baixa = 0
    ORDER BY ranking DESC, nom_mostrar
  `, [categoryId]);

  const snakeBlockSize = Number(req.body.snakeBlockSize || 4);
  const groups = drawGroups(participants, snakeBlockSize);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [oldGroups] = await connection.query(
      'SELECT idgrup FROM grups WHERE idcategoria = ?',
      [categoryId]
    );

    if (oldGroups.length) {
      const ids = oldGroups.map(g => g.idgrup);
      await connection.query(
        `DELETE FROM grup_participants WHERE idgrup IN (${ids.map(() => '?').join(',')})`,
        ids
      );
    }

    await connection.query(
      'DELETE FROM grups WHERE idcategoria = ?',
      [categoryId]
    );

    for (const group of groups) {
      const [groupResult] = await connection.query(`
        INSERT INTO grups
          (idcategoria, numero, nom, estat)
        VALUES (?, ?, ?, 'SORTEJAT')
      `, [
        categoryId,
        group.number,
        `Grup ${group.number}`
      ]);

      for (let i = 0; i < group.participants.length; i++) {
        const participant = group.participants[i];

        await connection.query(`
          INSERT INTO grup_participants
            (idgrup, idparticipant, posicio_sorteig, ordre_visual)
          VALUES (?, ?, ?, ?)
        `, [
          groupResult.insertId,
          participant.idparticipant,
          i + 1,
          i + 1
        ]);
      }
    }

    await connection.query(`
      UPDATE categories
      SET estat = 'SORTEJADA', format_competicio = ?
      WHERE idcategoria = ?
    `, [participants.length === 5 ? 'GRUP_UNIC' : 'GRUPS_MES_FINAL', categoryId]);

    await connection.query(`
      INSERT INTO log_canvis
        (accio, entitat, identitat, descripcio)
      VALUES ('SORTEIG_GRUPS', 'categoria', ?, ?)
    `, [
      categoryId,
      `Sorteig serp ${snakeBlockSize}x${snakeBlockSize} generat amb ${participants.length} participants i ${groups.length} grups`
    ]);

    await connection.commit();
    res.redirect(`/groups/category/${categoryId}`);
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
};

exports.moveParticipant = async (req, res) => {
  const participantId = Number(req.body.participantId);
  const targetGroupId = Number(req.body.targetGroupId);
  const categoryId = Number(req.body.categoryId);

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[targetGroup]] = await connection.query(`
      SELECT g.idgrup, g.numero
      FROM grups g
      WHERE g.idgrup = ?
        AND g.idcategoria = ?
    `, [targetGroupId, categoryId]);

    if (!targetGroup) {
      throw new Error('El grup de destí no és vàlid.');
    }

    const [[current]] = await connection.query(`
      SELECT gp.idgrupparticipant, gp.idgrup
      FROM grup_participants gp
      INNER JOIN grups g ON g.idgrup = gp.idgrup
      WHERE gp.idparticipant = ?
        AND g.idcategoria = ?
      LIMIT 1
    `, [participantId, categoryId]);

    if (!current) {
      throw new Error('No s\'ha trobat el participant dins dels grups.');
    }

    const [[maxOrder]] = await connection.query(`
      SELECT COALESCE(MAX(ordre_visual), 0) AS max_ordre
      FROM grup_participants
      WHERE idgrup = ?
    `, [targetGroupId]);

    await connection.query(`
      UPDATE grup_participants
      SET idgrup = ?, ordre_visual = ?
      WHERE idgrupparticipant = ?
    `, [targetGroupId, Number(maxOrder.max_ordre) + 1, current.idgrupparticipant]);

    await connection.query(`
      INSERT INTO log_canvis
        (accio, entitat, identitat, descripcio)
      VALUES ('MOURE_PARTICIPANT', 'participant', ?, ?)
    `, [
      participantId,
      `Mogut manualment al grup ${targetGroup.numero}`
    ]);

    await connection.commit();
    res.redirect(`/groups/category/${categoryId}`);
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
};


exports.printGroup = async (req, res) => {
  const groupId = Number(req.params.id);

  const [[group]] = await db.query(`
    SELECT
      g.*,
      c.nom AS categoria_nom,
      comp.nom AS competicio_nom,
      pg.data,
      pg.hora_inici,
      pg.hora_final,
      pg.durada_partit,
      t.numero AS taula_numero,
      t.nom AS taula_nom
    FROM grups g
    INNER JOIN categories c ON c.idcategoria = g.idcategoria
    INNER JOIN competicions comp ON comp.idcompeticio = c.idcompeticio
    LEFT JOIN programacio_grups pg ON pg.idgrup = g.idgrup
    LEFT JOIN taules t ON t.idtaula = pg.idtaula
    WHERE g.idgrup = ?
  `, [groupId]);

  if (!group) return res.status(404).send('Grup no trobat.');

  const [participants] = await db.query(`
    SELECT
      gp.ordre_visual,
      p.idparticipant,
      p.nom_mostrar,
      p.ranking,
      p.club,
      p.pais
    FROM grup_participants gp
    INNER JOIN participants p ON p.idparticipant = gp.idparticipant
    WHERE gp.idgrup = ?
    ORDER BY gp.ordre_visual
  `, [groupId]);

  const [matches] = await db.query(`
    SELECT
      pa.*,
      p1.nom_mostrar AS participant1_nom,
      p2.nom_mostrar AS participant2_nom,
      arb.nom_mostrar AS arbitre_nom
    FROM partits pa
    LEFT JOIN participants p1 ON p1.idparticipant = pa.participant1
    LEFT JOIN participants p2 ON p2.idparticipant = pa.participant2
    LEFT JOIN participants arb ON arb.idparticipant = pa.idarbitre_participant
    WHERE pa.idgrup = ?
    ORDER BY pa.data_hora, pa.numero_partit
  `, [groupId]);

  res.render('groups/print', { group, participants, matches });
};
