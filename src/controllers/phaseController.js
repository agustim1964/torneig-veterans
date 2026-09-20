const db = require('../config/db');
const { createPhase, propagateWinner } = require('../services/phaseService');

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

  const [tables] = await db.query(`
    SELECT idtaula, numero, nom, activa
    FROM taules
    ORDER BY numero
  `);

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
          DATE_FORMAT(p.data_hora, '%Y-%m-%dT%H:%i') AS data_hora_input,
          p1.nom_mostrar AS participant1_nom,
          p2.nom_mostrar AS participant2_nom,
          w.nom_mostrar AS guanyador_nom,
          t.numero AS taula_numero,
          t.nom AS taula_nom
        FROM partits p
        LEFT JOIN participants p1 ON p1.idparticipant = p.participant1
        LEFT JOIN participants p2 ON p2.idparticipant = p.participant2
        LEFT JOIN participants w ON w.idparticipant = p.guanyador
        LEFT JOIN taules t ON t.idtaula = p.idtaula
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
      const playableMatches = matches.filter(match => !Number(match.bye));
      round.printable =
        playableMatches.length > 0 &&
        playableMatches.every(match => match.participant1 && match.participant2);
    }

    const [[played]] = await db.query(`
      SELECT COUNT(*) AS total
      FROM partits p
      WHERE p.idfase = ?
        AND COALESCE(p.bye, 0) = 0
        AND (
          p.estat = 'FINALITZAT'
          OR p.resultat1 IS NOT NULL
          OR p.resultat2 IS NOT NULL
          OR EXISTS (
            SELECT 1
            FROM partit_jocs pj
            WHERE pj.idpartit = p.idpartit
          )
        )
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
    tables,
    groupsFinished,
    groupStatus
  });
};

exports.swapPlayers = async (req, res) => {
  const phaseId = Number(req.params.phaseId);
  const positionA = Number(req.body.positionA);
  const positionB = Number(req.body.positionB);

  if (
    !Number.isInteger(phaseId) || phaseId <= 0 ||
    !Number.isInteger(positionA) || positionA <= 0 ||
    !Number.isInteger(positionB) || positionB <= 0 ||
    positionA === positionB
  ) {
    return res.status(400).send('Cal seleccionar dos jugadors diferents.');
  }

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[phase]] = await connection.query(`
      SELECT f.idfase, f.idcategoria
      FROM fases f
      WHERE f.idfase = ?
        AND f.tipus = 'ELIMINATORIA'
      FOR UPDATE
    `, [phaseId]);

    if (!phase) throw new Error('Quadre eliminatori no trobat.');

    const [[resultStats]] = await connection.query(`
      SELECT COUNT(*) AS total
      FROM partits p
      WHERE p.idfase = ?
        AND COALESCE(p.bye, 0) = 0
        AND (
          p.estat = 'FINALITZAT'
          OR p.resultat1 IS NOT NULL
          OR p.resultat2 IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM partit_jocs pj WHERE pj.idpartit = p.idpartit
          )
        )
    `, [phaseId]);

    if (Number(resultStats.total || 0) > 0) {
      throw new Error(
        'No es poden intercanviar jugadors perquè el quadre ja té resultats introduïts.'
      );
    }

    const [selectedPositions] = await connection.query(`
      SELECT posicio, idparticipant, ranking_sorteig, origen
      FROM quadre_posicions
      WHERE idfase = ?
        AND posicio IN (?, ?)
      FOR UPDATE
    `, [phaseId, positionA, positionB]);

    if (
      selectedPositions.length !== 2 ||
      selectedPositions.some(position => !position.idparticipant)
    ) {
      throw new Error('Les dues posicions han de contenir un jugador.');
    }

    const first = selectedPositions.find(
      position => Number(position.posicio) === positionA
    );
    const second = selectedPositions.find(
      position => Number(position.posicio) === positionB
    );

    await connection.query(`
      UPDATE quadre_posicions
      SET
        idparticipant = CASE posicio WHEN ? THEN ? WHEN ? THEN ? END,
        ranking_sorteig = CASE posicio WHEN ? THEN ? WHEN ? THEN ? END,
        origen = CASE posicio WHEN ? THEN ? WHEN ? THEN ? END
      WHERE idfase = ?
        AND posicio IN (?, ?)
    `, [
      positionA, second.idparticipant, positionB, first.idparticipant,
      positionA, second.ranking_sorteig, positionB, first.ranking_sorteig,
      positionA, second.origen, positionB, first.origen,
      phaseId, positionA, positionB
    ]);

    // Reconstruïm el quadre buit mantenint les dates, hores i taules assignades.
    await connection.query(`
      UPDATE partits
      SET participant1 = NULL,
          participant2 = NULL,
          guanyador = NULL,
          resultat1 = NULL,
          resultat2 = NULL,
          estat = 'PENDENT',
          bye = 0
      WHERE idfase = ?
    `, [phaseId]);

    const [[firstRound]] = await connection.query(`
      SELECT idronda
      FROM rondes
      WHERE idfase = ?
      ORDER BY ordre
      LIMIT 1
    `, [phaseId]);

    const [slots] = await connection.query(`
      SELECT posicio, idparticipant
      FROM quadre_posicions
      WHERE idfase = ?
      ORDER BY posicio
    `, [phaseId]);

    const [firstRoundMatches] = await connection.query(`
      SELECT idpartit, numero_partit
      FROM partits
      WHERE idronda = ?
      ORDER BY numero_partit, idpartit
    `, [firstRound.idronda]);

    const slotMap = new Map(
      slots.map(slot => [Number(slot.posicio), slot.idparticipant])
    );
    const byeMatches = [];

    for (let index = 0; index < firstRoundMatches.length; index++) {
      const match = firstRoundMatches[index];
      const participant1 = slotMap.get(index * 2 + 1) || null;
      const participant2 = slotMap.get(index * 2 + 2) || null;
      const isBye = Boolean(participant1) !== Boolean(participant2);
      const winner = isBye ? (participant1 || participant2) : null;

      await connection.query(`
        UPDATE partits
        SET participant1 = ?,
            participant2 = ?,
            guanyador = ?,
            estat = ?,
            bye = ?
        WHERE idpartit = ?
      `, [
        participant1,
        participant2,
        winner,
        isBye ? 'FINALITZAT' : 'PENDENT',
        isBye ? 1 : 0,
        match.idpartit
      ]);

      if (isBye && winner) byeMatches.push({ idpartit: match.idpartit, winner });
    }

    for (const match of byeMatches) {
      await propagateWinner(connection, match.idpartit, match.winner);
    }

    await connection.query(`
      INSERT INTO log_canvis
        (accio, entitat, identitat, descripcio)
      VALUES ('INTERCANVIAR_JUGADORS_QUADRE', 'fase', ?, ?)
    `, [
      phaseId,
      `Intercanvi de les posicions ${positionA} i ${positionB}`
    ]);

    await connection.commit();
    res.redirect(`/phases/category/${phase.idcategoria}`);
  } catch (error) {
    await connection.rollback();
    res.status(400).send(`
      <div style="font-family:Arial;max-width:760px;margin:40px auto">
        <h1>No s'ha pogut fer l'intercanvi</h1>
        <p>${String(error.message || error)}</p>
        <p><a href="javascript:history.back()">Tornar a la fase final</a></p>
      </div>
    `);
  } finally {
    connection.release();
  }
};

exports.scheduleMatch = async (req, res) => {
  const matchId = Number(req.params.matchId);
  const categoryId = Number(req.body.categoryId);
  const tableId = req.body.tableId ? Number(req.body.tableId) : null;
  const date = String(req.body.date || '').trim();
  const time = String(req.body.time || '').trim();

  if (!Number.isInteger(matchId) || matchId <= 0) {
    return res.status(400).send('Partit no vàlid.');
  }

  if ((date && !time) || (!date && time)) {
    return res.status(400).send('Per assignar l’horari cal indicar la data i l’hora.');
  }

  if (
    (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) ||
    (time && !/^\d{2}:\d{2}$/.test(time))
  ) {
    return res.status(400).send('La data o l’hora no tenen un format vàlid.');
  }

  const [[match]] = await db.query(`
    SELECT p.idpartit, p.idcategoria
    FROM partits p
    INNER JOIN fases f ON f.idfase = p.idfase
    WHERE p.idpartit = ?
      AND f.tipus = 'ELIMINATORIA'
  `, [matchId]);

  if (!match || Number(match.idcategoria) !== categoryId) {
    return res.status(404).send('Partit eliminatori no trobat.');
  }

  if (tableId) {
    const [[table]] = await db.query(
      'SELECT idtaula FROM taules WHERE idtaula = ?',
      [tableId]
    );
    if (!table) return res.status(400).send('La taula seleccionada no existeix.');
  }

  const dateTime = date && time ? `${date} ${time}:00` : null;

  if (tableId && dateTime) {
    const [[conflict]] = await db.query(`
      SELECT p.idpartit, p.numero_partit, r.nom AS ronda_nom
      FROM partits p
      LEFT JOIN rondes r ON r.idronda = p.idronda
      WHERE p.idtaula = ?
        AND p.data_hora = ?
        AND p.idpartit <> ?
      LIMIT 1
    `, [tableId, dateTime, matchId]);

    if (conflict) {
      return res.status(409).send(`
        <div style="font-family:Arial;max-width:760px;margin:40px auto">
          <h1>Taula ocupada</h1>
          <p>Aquesta taula ja està assignada al partit ${conflict.numero_partit}
             (${conflict.ronda_nom || 'sense ronda'}) a la mateixa hora.</p>
          <p><a href="javascript:history.back()">Tornar a la fase final</a></p>
        </div>
      `);
    }
  }

  await db.query(`
    UPDATE partits
    SET idtaula = ?, data_hora = ?
    WHERE idpartit = ?
  `, [tableId, dateTime, matchId]);

  await db.query(`
    INSERT INTO log_canvis
      (accio, entitat, identitat, descripcio)
    VALUES ('PROGRAMAR_PARTIT_ELIMINATORI', 'partit', ?, ?)
  `, [
    matchId,
    `Taula ${tableId || 'sense assignar'}; horari ${dateTime || 'sense assignar'}`
  ]);

  res.redirect(`/phases/category/${categoryId}`);
};

exports.printRoundSheets = async (req, res) => {
  const roundId = Number(req.params.roundId);
  let bestOf = Number(req.query.bestOf || 5);

  if (!Number.isInteger(roundId) || roundId <= 0) {
    return res.status(400).send('Ronda no vàlida.');
  }

  if (![3, 5, 7].includes(bestOf)) bestOf = 5;

  const [[round]] = await db.query(`
    SELECT
      r.idronda,
      r.nom AS ronda_nom,
      f.idfase,
      f.nom AS fase_nom,
      c.idcategoria,
      c.nom AS categoria_nom,
      comp.nom AS competicio_nom,
      comp.lloc AS competicio_lloc
    FROM rondes r
    INNER JOIN fases f ON f.idfase = r.idfase
    INNER JOIN categories c ON c.idcategoria = f.idcategoria
    INNER JOIN competicions comp ON comp.idcompeticio = c.idcompeticio
    WHERE r.idronda = ?
      AND f.tipus = 'ELIMINATORIA'
  `, [roundId]);

  if (!round) return res.status(404).send('Ronda eliminatòria no trobada.');

  const [matches] = await db.query(`
    SELECT
      p.idpartit,
      p.numero_partit,
      p.participant1,
      p.participant2,
      p.data_hora,
      p.idtaula,
      p1.nom_mostrar AS participant1_nom,
      p2.nom_mostrar AS participant2_nom,
      t.numero AS taula_numero,
      t.nom AS taula_nom
    FROM partits p
    LEFT JOIN participants p1 ON p1.idparticipant = p.participant1
    LEFT JOIN participants p2 ON p2.idparticipant = p.participant2
    LEFT JOIN taules t ON t.idtaula = p.idtaula
    WHERE p.idronda = ?
      AND COALESCE(p.bye, 0) = 0
    ORDER BY p.numero_partit, p.idpartit
  `, [roundId]);

  if (!matches.length) {
    return res.status(400).send(`
      <div style="font-family:Arial;max-width:720px;margin:40px auto">
        <h1>No hi ha actes per imprimir</h1>
        <p>Aquesta ronda no conté cap partit real.</p>
        <p><a href="/phases/category/${round.idcategoria}">Tornar a la fase final</a></p>
      </div>
    `);
  }

  const pendingMatches = matches.filter(
    match => !match.participant1 || !match.participant2
  );

  if (pendingMatches.length) {
    return res.status(400).send(`
      <div style="font-family:Arial;max-width:720px;margin:40px auto">
        <h1>La ronda encara no està definida</h1>
        <p>Hi ha ${pendingMatches.length} partit(s) sense els dos participants.</p>
        <p>Les actes es podran imprimir quan tots els enfrontaments de la ronda estiguin definits.</p>
        <p><a href="/phases/category/${round.idcategoria}">Tornar a la fase final</a></p>
      </div>
    `);
  }

  res.render('phases/print-match-sheets', {
    round,
    matches,
    bestOf
  });
};

exports.printBracket = async (req, res) => {
  const phaseId = Number(req.params.phaseId);

  if (!Number.isInteger(phaseId) || phaseId <= 0) {
    return res.status(400).send('Quadre no vàlid.');
  }

  const [[phase]] = await db.query(`
    SELECT
      f.idfase,
      f.nom AS fase_nom,
      f.ordre AS fase_ordre,
      c.idcategoria,
      c.nom AS categoria_nom,
      comp.idcompeticio,
      comp.nom AS competicio_nom,
      comp.lloc AS competicio_lloc,
      comp.data_inici,
      comp.data_fi
    FROM fases f
    INNER JOIN categories c ON c.idcategoria = f.idcategoria
    INNER JOIN competicions comp ON comp.idcompeticio = c.idcompeticio
    WHERE f.idfase = ?
      AND f.tipus = 'ELIMINATORIA'
  `, [phaseId]);

  if (!phase) return res.status(404).send('Quadre eliminatori no trobat.');

  const [rounds] = await db.query(`
    SELECT idronda, nom, ordre, mida_quadre
    FROM rondes
    WHERE idfase = ?
    ORDER BY ordre, idronda
  `, [phaseId]);

  let matchSequence = 1;

  for (const round of rounds) {
    const [matches] = await db.query(`
      SELECT
        p.idpartit,
        p.numero_partit,
        p.participant1,
        p.participant2,
        p.resultat1,
        p.resultat2,
        p.guanyador,
        p.bye,
        DATE_FORMAT(p.data_hora, '%H:%i') AS hora_partit,
        t.numero AS taula_numero,
        p1.nom_mostrar AS participant1_nom,
        p1.club AS participant1_club,
        (
          SELECT GROUP_CONCAT(j1.num_llicencia ORDER BY pj1.ordre SEPARATOR ' / ')
          FROM participant_jugadors pj1
          INNER JOIN jugadors j1 ON j1.idjugador = pj1.idjugador
          WHERE pj1.idparticipant = p.participant1
        ) AS participant1_llicencia,
        p2.nom_mostrar AS participant2_nom,
        p2.club AS participant2_club,
        (
          SELECT GROUP_CONCAT(j2.num_llicencia ORDER BY pj2.ordre SEPARATOR ' / ')
          FROM participant_jugadors pj2
          INNER JOIN jugadors j2 ON j2.idjugador = pj2.idjugador
          WHERE pj2.idparticipant = p.participant2
        ) AS participant2_llicencia
      FROM partits p
      LEFT JOIN participants p1 ON p1.idparticipant = p.participant1
      LEFT JOIN participants p2 ON p2.idparticipant = p.participant2
      LEFT JOIN taules t ON t.idtaula = p.idtaula
      WHERE p.idronda = ?
      ORDER BY p.numero_partit, p.idpartit
    `, [round.idronda]);

    matches.forEach((match, index) => {
      match.acta_numero = matchSequence++;
      match.slot1 = Number(round.ordre) === 1 ? index * 2 + 1 : null;
      match.slot2 = Number(round.ordre) === 1 ? index * 2 + 2 : null;
      match.resultat =
        match.resultat1 !== null && match.resultat2 !== null
          ? `${match.resultat1}-${match.resultat2}`
          : '';
    });

    round.matches = matches;
  }

  const bracketSize = rounds.length
    ? Number(rounds[0].mida_quadre || rounds[0].matches.length * 2)
    : 0;

  res.render('phases/print-bracket', {
    phase,
    rounds,
    bracketSize
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
