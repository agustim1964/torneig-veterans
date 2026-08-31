const db = require('../config/db');
const { drawGroups } = require('../services/drawService');

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
        p.ranking
      FROM grup_participants gp
      INNER JOIN participants p
        ON p.idparticipant = gp.idparticipant
      WHERE gp.idgrup = ?
      ORDER BY gp.ordre_visual, p.ranking DESC, p.nom_mostrar
    `, [group.idgrup]);

    group.participants = participants;
  }

  res.render('groups/index', { category, groups });
};

exports.draw = async (req, res) => {
  const categoryId = Number(req.params.categoryId);

  const [participants] = await db.query(`
    SELECT idparticipant, nom_mostrar, ranking
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
