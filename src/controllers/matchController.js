const db = require('../config/db');
const { buildGroupMatchOrder, assignGroupReferees } = require('../services/matchService');
const { classifyGroup } = require('../services/classificationService');

async function getCategory(categoryId) {
  const [[category]] = await db.query(`
    SELECT c.*, comp.nom AS competicio_nom, comp.idcompeticio,
           cc.tipus_arbitratge
    FROM categories c
    INNER JOIN competicions comp
      ON comp.idcompeticio = c.idcompeticio
    LEFT JOIN configuracio_competicio cc
      ON cc.idcompeticio = comp.idcompeticio
    WHERE c.idcategoria = ?
  `, [categoryId]);
  return category;
}

exports.listByCategory = async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const category = await getCategory(categoryId);

  if (!category) return res.status(404).send('Categoria no trobada.');

  const [matches] = await db.query(`
    SELECT
      pa.*,
      g.numero AS grup_numero,
      p1.nom_mostrar AS participant1_nom,
      p2.nom_mostrar AS participant2_nom,
      arb.nom_mostrar AS arbitre_nom,
      t.numero AS taula_numero,
      t.nom AS taula_nom
    FROM partits pa
    INNER JOIN grups g ON g.idgrup = pa.idgrup
    LEFT JOIN participants p1 ON p1.idparticipant = pa.participant1
    LEFT JOIN participants p2 ON p2.idparticipant = pa.participant2
    LEFT JOIN participants arb ON arb.idparticipant = pa.idarbitre_participant
    LEFT JOIN taules t ON t.idtaula = pa.idtaula
    WHERE pa.idcategoria = ?
      AND pa.idgrup IS NOT NULL
    ORDER BY pa.data_hora, g.numero, pa.numero_partit
  `, [categoryId]);


  for (const match of matches) {
    const [games] = await db.query(`
      SELECT numero_joc, punts1, punts2
      FROM partit_jocs
      WHERE idpartit = ?
      ORDER BY numero_joc
    `, [match.idpartit]);

    match.jocs = games;
  }

  const [groups] = await db.query(`
    SELECT *
    FROM grups
    WHERE idcategoria = ?
    ORDER BY numero
  `, [categoryId]);

  const [allGameRows] = await db.query(`
    SELECT pj.*
    FROM partit_jocs pj
    INNER JOIN partits pa ON pa.idpartit = pj.idpartit
    WHERE pa.idcategoria = ?
      AND pa.idgrup IS NOT NULL
    ORDER BY pj.idpartit, pj.numero_joc
  `, [categoryId]);

  const groupedStandings = {};

  for (const group of groups) {
    const [participants] = await db.query(`
      SELECT p.idparticipant, p.nom_mostrar, p.ranking
      FROM grup_participants gp
      INNER JOIN participants p
        ON p.idparticipant = gp.idparticipant
      WHERE gp.idgrup = ?
      ORDER BY gp.ordre_visual
    `, [group.idgrup]);

    const groupMatches = matches.filter(m => m.idgrup === group.idgrup);
    const matchIds = new Set(groupMatches.map(m => m.idpartit));
    const groupGames = allGameRows.filter(g => matchIds.has(g.idpartit));

    groupedStandings[group.idgrup] = classifyGroup(
      participants,
      groupMatches,
      groupGames
    ).map(row => ({
      ...row,
      grup_numero: group.numero
    }));
  }

  const totalMatches = matches.length;
  const finishedMatches = matches.filter(m => m.estat === 'FINALITZAT').length;
  const topXComplete =
    category.format_competicio === 'GRUP_UNIC' &&
    totalMatches > 0 &&
    finishedMatches === totalMatches;

  res.render('matches/index', {
    category,
    matches,
    groupedStandings,
    totalMatches,
    finishedMatches,
    topXComplete
  });
};

async function generateOneGroup(cx, categoryId, group, startingNumber = 1, isTopX = false, externalReferees = false) {
  const [participants] = await cx.query(`
    SELECT p.idparticipant, p.nom_mostrar, gp.ordre_visual
    FROM grup_participants gp
    INNER JOIN participants p ON p.idparticipant = gp.idparticipant
    WHERE gp.idgrup = ?
    ORDER BY gp.ordre_visual
  `, [group.idgrup]);

  const orderedMatches = buildGroupMatchOrder(participants, { topX: isTopX });

  // En Top X amb X/2 taules tots (o gairebé tots) els jugadors juguen
  // simultàniament. Per tant no assignem un jugador del grup com a àrbitre
  // perquè podria estar jugant al mateix moment.
  const matchesWithReferees = (isTopX || externalReferees)
    ? orderedMatches.map(m => ({ ...m, idarbitre_participant: null }))
    : assignGroupReferees(orderedMatches, participants);

  const [assignedTables] = await cx.query(`
    SELECT pgt.idtaula, pgt.ordre
    FROM programacio_grups pg
    INNER JOIN programacio_grup_taules pgt ON pgt.idprogramacio = pg.idprogramacio
    WHERE pg.idgrup = ?
    ORDER BY pgt.ordre
  `, [group.idgrup]);

  const tableIds = assignedTables.length
    ? assignedTables.map(t => Number(t.idtaula))
    : [Number(group.idtaula)];

  const [hh, mm] = String(group.hora_inici).split(':').map(Number);
  const dt = new Date(group.data);
  dt.setHours(hh, mm, 0, 0);
  const duration = Number(group.durada_partit || 20);

  let num = startingNumber;

  const roundCounters = new Map();

  for (let i = 0; i < matchesWithReferees.length; i++) {
    const match = matchesWithReferees[i];
    let when;
    let tableId;

    if (isTopX) {
      const round = Number(match.ronda || 1);
      const idx = roundCounters.get(round) || 0;
      roundCounters.set(round, idx + 1);
      when = new Date(dt.getTime() + (round - 1) * duration * 60000);
      tableId = tableIds[idx % tableIds.length];
    } else {
      when = new Date(dt.getTime() + i * duration * 60000);
      tableId = tableIds[0];
    }

    await cx.query(`
      INSERT INTO partits
        (idcategoria, idgrup, numero_partit, ronda_grup, participant1, participant2,
         idarbitre_participant, estat, idtaula, data_hora)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDENT', ?, ?)
    `, [
      categoryId,
      group.idgrup,
      num++,
      match.ronda || null,
      match.participant1,
      match.participant2,
      match.idarbitre_participant,
      tableId,
      when
    ]);
  }

  return num;
}

exports.generateGroups = async (req, res) => {
  const categoryId = Number(req.params.categoryId);
  const category = await getCategory(categoryId);

  const [groups] = await db.query(`
    SELECT g.*, pg.idtaula, pg.data, pg.hora_inici, pg.durada_partit
    FROM grups g
    LEFT JOIN programacio_grups pg ON pg.idgrup = g.idgrup
    WHERE g.idcategoria = ?
    ORDER BY g.numero
  `, [categoryId]);

  if (groups.some(g => !g.idtaula || !g.hora_inici || !g.data)) {
    return res.status(400).send(`
      <h1>Falta programació</h1>
      <p>Cal assignar data, hora i taula a tots els grups abans de generar els partits.</p>
      <p><a href="/schedule/competition/${category.idcompeticio}">Anar al màster</a></p>
    `);
  }

  const cx = await db.getConnection();
  try {
    await cx.beginTransaction();

    const [[maxNum]] = await cx.query(`
      SELECT COALESCE(MAX(numero_partit), 0) AS max_num
      FROM partits
      WHERE idcategoria = ? AND idgrup IS NOT NULL
    `, [categoryId]);

    let num = Number(maxNum.max_num || 0) + 1;

    for (const g of groups) {
      const [[existing]] = await cx.query(`
        SELECT COUNT(*) AS total
        FROM partits
        WHERE idgrup = ?
      `, [g.idgrup]);

      // Un grup que ja té partits no es toca. Per regenerar-lo cal usar
      // el botó específic "Reiniciar i regenerar partits".
      if (Number(existing.total || 0) > 0) continue;

      num = await generateOneGroup(cx, categoryId, g, num, category.format_competicio === 'GRUP_UNIC', category.tipus_arbitratge === 'EXTERNS');
    }

    await cx.commit();
    res.redirect(`/matches/category/${categoryId}`);
  } catch (e) {
    await cx.rollback();
    throw e;
  } finally {
    cx.release();
  }
};

exports.regenerateGroup = async (req, res) => {
  const groupId = Number(req.params.groupId);

  const [[group]] = await db.query(`
    SELECT g.*, c.idcategoria, c.format_competicio, c.idcompeticio,
           cc.tipus_arbitratge,
           pg.idtaula, pg.data, pg.hora_inici, pg.durada_partit
    FROM grups g
    INNER JOIN categories c ON c.idcategoria = g.idcategoria
    LEFT JOIN configuracio_competicio cc ON cc.idcompeticio = c.idcompeticio
    LEFT JOIN programacio_grups pg ON pg.idgrup = g.idgrup
    WHERE g.idgrup = ?
  `, [groupId]);

  if (!group) return res.status(404).send('Grup no trobat.');

  if (!group.idtaula || !group.data || !group.hora_inici) {
    return res.status(400).send(`
      <h1>Falta programació del grup</h1>
      <p>Assigna primer data, hora i taula al grup.</p>
      <p><a href="/groups/category/${group.idcategoria}">Tornar als grups</a></p>
    `);
  }

  const cx = await db.getConnection();
  try {
    await cx.beginTransaction();

    // partit_jocs s'elimina automàticament per ON DELETE CASCADE.
    await cx.query('DELETE FROM partits WHERE idgrup = ?', [groupId]);

    const [[maxNum]] = await cx.query(`
      SELECT COALESCE(MAX(numero_partit), 0) AS max_num
      FROM partits
      WHERE idcategoria = ? AND idgrup IS NOT NULL
    `, [group.idcategoria]);

    await generateOneGroup(
      cx,
      group.idcategoria,
      group,
      Number(maxNum.max_num || 0) + 1,
      group.format_competicio === 'GRUP_UNIC',
      group.tipus_arbitratge === 'EXTERNS'
    );

    await cx.query(`
      INSERT INTO log_canvis
        (accio, entitat, identitat, descripcio)
      VALUES ('REGENERAR_PARTITS_GRUP', 'grup', ?, ?)
    `, [groupId, 'Partits i resultats del grup eliminats i regenerats']);

    await cx.commit();
    res.redirect(`/matches/category/${group.idcategoria}`);
  } catch (e) {
    await cx.rollback();
    throw e;
  } finally {
    cx.release();
  }
};

exports.deleteGroupMatches = async (req, res) => {
  const groupId = Number(req.params.groupId);

  const [[group]] = await db.query(`
    SELECT idgrup, idcategoria
    FROM grups
    WHERE idgrup = ?
  `, [groupId]);

  if (!group) return res.status(404).send('Grup no trobat.');

  const cx = await db.getConnection();
  try {
    await cx.beginTransaction();
    await cx.query('DELETE FROM partits WHERE idgrup = ?', [groupId]);
    await cx.query(`
      INSERT INTO log_canvis
        (accio, entitat, identitat, descripcio)
      VALUES ('ELIMINAR_PARTITS_GRUP', 'grup', ?, ?)
    `, [groupId, 'Partits i resultats del grup eliminats manualment']);
    await cx.commit();
    res.redirect(`/groups/category/${group.idcategoria}`);
  } catch (e) {
    await cx.rollback();
    throw e;
  } finally {
    cx.release();
  }
};


exports.saveResult = async (req, res) => {
  const matchId = Number(req.params.id);
  const categoryId = Number(req.body.categoryId);

  const [[match]] = await db.query(`
    SELECT participant1, participant2
    FROM partits
    WHERE idpartit = ?
  `, [matchId]);

  if (!match) return res.status(404).send('Partit no trobat.');

  const games = [];

  for (let n = 1; n <= 5; n++) {
    const raw1 = req.body[`joc${n}_p1`];
    const raw2 = req.body[`joc${n}_p2`];

    if (
      raw1 !== undefined && raw1 !== '' &&
      raw2 !== undefined && raw2 !== ''
    ) {
      games.push({
        numero_joc: n,
        punts1: Number(raw1),
        punts2: Number(raw2)
      });
    }
  }

  function validGameScore(a, b) {
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a === b) {
      return false;
    }
    const winner = Math.max(a, b);
    const loser = Math.min(a, b);
    if (loser <= 9) return winner === 11;
    return winner >= 12 && winner - loser === 2;
  }

  for (const game of games) {
    if (!validGameScore(game.punts1, game.punts2)) {
      return res.status(400).send(`
        <div style="font-family:Arial;max-width:720px;margin:40px auto">
          <h1>Resultat de joc no vàlid</h1>
          <p>Joc ${game.numero_joc}: <strong>${game.punts1}-${game.punts2}</strong>.</p>
          <p>Fins a 9 punts del perdedor, el guanyador ha de tenir 11. A partir de 10-10 cal guanyar per 2 punts.</p>
          <p><a href="/matches/category/${categoryId}">Tornar als partits</a></p>
        </div>
      `);
    }
  }

  // En un partit al millor de 5 només són vàlids els jocs
  // disputats fins que un participant arriba a 3 jocs guanyats.
  let r1 = 0;
  let r2 = 0;
  const validGames = [];

  for (const game of games.sort((a, b) => a.numero_joc - b.numero_joc)) {
    if (r1 >= 3 || r2 >= 3) break;

    // No comptem un joc empatat com a joc finalitzat.
    if (game.punts1 === game.punts2) continue;

    validGames.push(game);

    if (game.punts1 > game.punts2) r1++;
    else r2++;
  }

  let winner = null;
  if (r1 === 3) winner = match.participant1;
  if (r2 === 3) winner = match.participant2;

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    await connection.query(`
      DELETE FROM partit_jocs
      WHERE idpartit = ?
    `, [matchId]);

    for (const game of validGames) {
      await connection.query(`
        INSERT INTO partit_jocs
          (idpartit, numero_joc, punts1, punts2)
        VALUES (?, ?, ?, ?)
      `, [
        matchId,
        game.numero_joc,
        game.punts1,
        game.punts2
      ]);
    }

    await connection.query(`
      UPDATE partits
      SET
        resultat1 = ?,
        resultat2 = ?,
        guanyador = ?,
        estat = ?
      WHERE idpartit = ?
    `, [
      r1,
      r2,
      winner,
      winner ? 'FINALITZAT' : 'PENDENT',
      matchId
    ]);

    await connection.commit();
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }

  res.redirect(`/matches/category/${categoryId}`);
};
