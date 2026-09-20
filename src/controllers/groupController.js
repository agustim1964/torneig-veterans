const db = require('../config/db');
const { drawGroups, buildSingleGroup, groupWarnings } = require('../services/drawService');
const { classifyGroup } = require('../services/classificationService');

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
    group.warnings = category.format_competicio === 'GRUP_UNIC' ? [] : groupWarnings(group);

    const [[matchStats]] = await db.query(`
      SELECT
        COUNT(*) AS total_partits,
        SUM(CASE WHEN estat = 'FINALITZAT' THEN 1 ELSE 0 END) AS partits_finalitzats
      FROM partits
      WHERE idgrup = ?
    `, [group.idgrup]);

    group.total_partits = Number(matchStats.total_partits || 0);
    group.partits_finalitzats = Number(matchStats.partits_finalitzats || 0);
  }

  res.render('groups/index', { category, groups });
};

exports.draw = async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const category = await loadCategory(categoryId);

  if (!category) return res.status(404).send('Categoria no trobada');

  const [participants] = await db.query(`
    SELECT idparticipant, nom_mostrar, ranking, club, pais
    FROM participants
    WHERE idcategoria = ?
      AND actiu = 1
      AND baixa = 0
    ORDER BY ranking DESC, nom_mostrar
  `, [categoryId]);

  const snakeBlockSize = Number(req.body.snakeBlockSize || 4);
  const maxGroupSize = Number(req.body.maxGroupSize || 4);
  const isTopX = category.format_competicio === 'GRUP_UNIC';

  const groups = isTopX
    ? buildSingleGroup(participants)
    : drawGroups(participants, snakeBlockSize, maxGroupSize);

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[matchStats]] = await connection.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN pa.estat = 'FINALITZAT' THEN 1 ELSE 0 END) AS finalitzats
      FROM partits pa
      INNER JOIN grups g ON g.idgrup = pa.idgrup
      WHERE g.idcategoria = ?
    `, [categoryId]);

    if (Number(matchStats.finalitzats || 0) > 0) {
      await connection.rollback();
      return res.status(409).send(`
        <div style="font-family:Arial;max-width:760px;margin:40px auto">
          <h1>No es pot reconstruir ${isTopX ? 'el Top X' : 'el sorteig'}</h1>
          <p>Hi ha partits amb resultats desats.</p>
          <p>Per seguretat, elimina/reinicia primer els partits dels grups afectats.</p>
          <p><a href="/groups/category/${categoryId}">Tornar als grups</a></p>
        </div>
      `);
    }

    // Els partits pendents deixen de ser vàlids si reconstruïm els grups.
    if (Number(matchStats.total || 0) > 0) {
      await connection.query(`
        DELETE pa
        FROM partits pa
        INNER JOIN grups g ON g.idgrup = pa.idgrup
        WHERE g.idcategoria = ?
      `, [categoryId]);
    }

    const [oldGroups] = await connection.query(
      'SELECT idgrup FROM grups WHERE idcategoria = ?',
      [categoryId]
    );

    if (oldGroups.length) {
      const ids = oldGroups.map(g => g.idgrup);
      const ph = ids.map(() => '?').join(',');
      await connection.query(
        `DELETE FROM grup_participants WHERE idgrup IN (${ph})`,
        ids
      );
    }

    await connection.query(
      'DELETE FROM grups WHERE idcategoria = ?',
      [categoryId]
    );

    for (const group of groups) {
      const groupName = isTopX ? `Top ${participants.length}` : `Grup ${group.number}`;

      const [groupResult] = await connection.query(`
        INSERT INTO grups
          (idcategoria, numero, nom, estat)
        VALUES (?, ?, ?, 'SORTEJAT')
      `, [categoryId, group.number, groupName]);

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

    let resultingFormat = category.format_competicio;
    if (category.format_competicio === 'AUTO') {
      resultingFormat = participants.length === 5 ? 'GRUP_UNIC' : 'GRUPS_MES_FINAL';
    }

    await connection.query(`
      UPDATE categories
      SET estat = 'SORTEJADA', format_competicio = ?
      WHERE idcategoria = ?
    `, [resultingFormat, categoryId]);

    await connection.query(`
      INSERT INTO log_canvis
        (accio, entitat, identitat, descripcio)
      VALUES (?, 'categoria', ?, ?)
    `, [
      isTopX ? 'CREAR_TOP_X' : 'SORTEIG_GRUPS',
      categoryId,
      isTopX
        ? `Top ${participants.length} creat amb un únic grup segons rànquing`
        : `Sorteig serp ${snakeBlockSize}x${snakeBlockSize}, grup màxim ${maxGroupSize}, generat amb ${participants.length} participants i ${groups.length} grups`
    ]);

    await connection.commit();
    res.redirect(`/groups/category/${categoryId}`);
  } catch (e) {
    await connection.rollback();
    return res.status(400).send(`
      <div style="font-family:Arial;max-width:760px;margin:40px auto">
        <h1>No s'ha pogut fer el sorteig</h1>
        <p>${String(e.message || e)}</p>
        <p><a href="/groups/category/${categoryId}">Tornar als grups</a></p>
      </div>
    `);
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
      SELECT gp.idgrupparticipant, gp.idgrup, g.numero AS grup_numero
      FROM grup_participants gp
      INNER JOIN grups g ON g.idgrup = gp.idgrup
      WHERE gp.idparticipant = ?
        AND g.idcategoria = ?
      LIMIT 1
    `, [participantId, categoryId]);

    if (!current) {
      throw new Error('No s\'ha trobat el participant dins dels grups.');
    }

    if (Number(current.idgrup) === targetGroupId) {
      await connection.rollback();
      return res.redirect(`/groups/category/${categoryId}`);
    }

    const affectedGroups = [Number(current.idgrup), targetGroupId];
    const placeholders = affectedGroups.map(() => '?').join(',');

    const [[stats]] = await connection.query(`
      SELECT
        COUNT(*) AS total_partits,
        SUM(CASE WHEN estat = 'FINALITZAT' THEN 1 ELSE 0 END) AS finalitzats
      FROM partits
      WHERE idgrup IN (${placeholders})
    `, affectedGroups);

    if (Number(stats.finalitzats || 0) > 0) {
      await connection.rollback();
      return res.status(409).send(`
        <div style="font-family:Arial;max-width:760px;margin:40px auto">
          <h1>No es pot moure el jugador encara</h1>
          <p>El grup ${current.grup_numero} o el grup ${targetGroup.numero} té partits amb resultat desat.</p>
          <p>Per evitar incoherències, primer ves als grups i utilitza <strong>Reiniciar partits</strong> en els grups afectats. Després podràs moure el jugador i regenerar els partits.</p>
          <p><a href="/groups/category/${categoryId}">Tornar als grups</a></p>
        </div>
      `);
    }

    // Si només hi havia partits pendents, queden invalidats pel canvi de grup.
    // Els eliminem dels dos grups afectats abans de moure el participant.
    if (Number(stats.total_partits || 0) > 0) {
      await connection.query(`
        DELETE FROM partits
        WHERE idgrup IN (${placeholders})
      `, affectedGroups);
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
      `Mogut manualment del grup ${current.grup_numero} al grup ${targetGroup.numero}`
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


async function loadPrintableGroup(groupId) {
  const [[group]] = await db.query(`
    SELECT
      g.*,
      c.nom AS categoria_nom,
      c.format_competicio,
      c.mode_taules_grups,
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

  if (!group) return null;

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

  const [games] = await db.query(`
    SELECT pj.idpartit, pj.numero_joc, pj.punts1, pj.punts2
    FROM partit_jocs pj
    INNER JOIN partits pa ON pa.idpartit = pj.idpartit
    WHERE pa.idgrup = ?
    ORDER BY pj.idpartit, pj.numero_joc
  `, [groupId]);

  for (const match of matches) {
    match.jocs = games.filter(game => Number(game.idpartit) === Number(match.idpartit));
  }

  const finishedMatches = matches.filter(match => match.estat === 'FINALITZAT');
  const standings = finishedMatches.length
    ? classifyGroup(participants, matches, games)
    : [];

  return {
    group,
    participants,
    matches,
    standings,
    classificationFinal: matches.length > 0 && finishedMatches.length === matches.length
  };
}

exports.printGroup = async (req, res) => {
  const groupId = Number(req.params.id);
  const sheet = await loadPrintableGroup(groupId);

  if (!sheet) return res.status(404).send('Grup no trobat.');

  res.render('groups/print', {
    pageTitle: `${sheet.group.categoria_nom} · Grup ${sheet.group.numero}`,
    sheets: [sheet]
  });
};

exports.printCategoryGroups = async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const requestedGroupId = req.query.groupId ? Number(req.query.groupId) : null;

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return res.status(400).send('Categoria no vàlida.');
  }
  if (req.query.groupId && (!Number.isInteger(requestedGroupId) || requestedGroupId <= 0)) {
    return res.status(400).send('Grup no vàlid.');
  }

  const [[category]] = await db.query(`
    SELECT c.idcategoria, c.nom, comp.nom AS competicio_nom
    FROM categories c
    INNER JOIN competicions comp ON comp.idcompeticio = c.idcompeticio
    WHERE c.idcategoria = ?
  `, [categoryId]);

  if (!category) return res.status(404).send('Categoria no trobada.');

  const [groups] = await db.query(`
    SELECT idgrup, numero
    FROM grups
    WHERE idcategoria = ?
      AND (? IS NULL OR idgrup = ?)
    ORDER BY numero, idgrup
  `, [categoryId, requestedGroupId, requestedGroupId]);

  if (requestedGroupId && !groups.length) {
    return res.status(400).send('El grup seleccionat no pertany a aquesta categoria.');
  }

  const sheets = [];
  for (const group of groups) {
    const sheet = await loadPrintableGroup(group.idgrup);
    if (sheet) sheets.push(sheet);
  }

  res.render('groups/print', {
    pageTitle: requestedGroupId
      ? `${category.nom} · Grup ${groups[0].numero}`
      : `${category.nom} · Tots els grups`,
    sheets
  });
};
