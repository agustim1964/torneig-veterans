const db = require('../config/db');
const { classifyGroup } = require('./classificationService');

function nextPowerOfTwo(n) {
  let p = 2;
  while (p < n) p *= 2;
  return p;
}

function shuffle(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Ordre estàndard dels caps de sèrie al quadre.
// 8 => [1,8,5,4,3,6,7,2]
// Això deixa 1 i 2 als dos extrems, 3/4 a meitats oposades,
// 5..8 repartits per quarts, etc.
function standardSeedOrder(size) {
  let order = [1, 2];

  for (let n = 4; n <= size; n *= 2) {
    const next = [];
    order.forEach((seed, index) => {
      const pair = [seed, n + 1 - seed];
      if (index % 2 === 1) pair.reverse();
      next.push(...pair);
    });
    order = next;
  }

  return order;
}

function seedSlotMap(size) {
  const order = standardSeedOrder(size);
  const map = new Map();
  order.forEach((seed, index) => map.set(seed, index + 1));
  return map;
}

function bandForSeed(seed) {
  if (seed <= 2) return [seed, seed];

  let start = 3;
  let end = 4;

  while (seed > end) {
    start = end + 1;
    end *= 2;
  }

  return [start, end];
}

function meetingRound(slotA, slotB, bracketSize) {
  if (!slotA || !slotB || slotA === slotB) return 0;

  let block = 2;
  let round = 1;

  while (block <= bracketSize) {
    if (
      Math.floor((slotA - 1) / block) ===
      Math.floor((slotB - 1) / block)
    ) {
      return round;
    }

    block *= 2;
    round++;
  }

  return round;
}

function roundName(playersInRound) {
  if (playersInRound === 2) return 'Final';
  if (playersInRound === 4) return 'Semifinal';
  if (playersInRound === 8) return '1/4';
  if (playersInRound === 16) return '1/8';
  if (playersInRound === 32) return '1/16';
  if (playersInRound === 64) return '1/32';
  if (playersInRound === 128) return '1/64';
  return `Ronda de ${playersInRound}`;
}

async function loadGroupStandings(categoryId) {
  const [groups] = await db.query(`
    SELECT idgrup, numero
    FROM grups
    WHERE idcategoria = ?
    ORDER BY numero
  `, [categoryId]);

  const result = [];

  for (const group of groups) {
    const [participants] = await db.query(`
      SELECT
        p.idparticipant,
        p.nom_mostrar,
        p.ranking
      FROM grup_participants gp
      INNER JOIN participants p
        ON p.idparticipant = gp.idparticipant
      WHERE gp.idgrup = ?
      ORDER BY gp.ordre_visual
    `, [group.idgrup]);

    const [matches] = await db.query(`
      SELECT *
      FROM partits
      WHERE idgrup = ?
      ORDER BY numero_partit
    `, [group.idgrup]);

    const unfinished = matches.filter(m => m.estat !== 'FINALITZAT');
    if (!matches.length || unfinished.length) {
      throw new Error(`El Grup ${group.numero} encara no està finalitzat.`);
    }

    const [games] = await db.query(`
      SELECT pj.*
      FROM partit_jocs pj
      INNER JOIN partits pa ON pa.idpartit = pj.idpartit
      WHERE pa.idgrup = ?
      ORDER BY pj.idpartit, pj.numero_joc
    `, [group.idgrup]);

    const standings = classifyGroup(participants, matches, games);

    standings.forEach((row, index) => {
      result.push({
        ...row,
        idgrup: group.idgrup,
        grup_numero: Number(group.numero),
        posicio_grup: index + 1
      });
    });
  }

  return result;
}

function placeSeededPrimary(entries, bracketSize) {
  const slots = Array(bracketSize + 1).fill(null);
  const seedSlots = seedSlotMap(bracketSize);

  const byBand = new Map();

  for (const entry of entries) {
    const [start, end] = bandForSeed(entry.seed);
    const key = `${start}-${end}`;

    if (!byBand.has(key)) byBand.set(key, []);
    byBand.get(key).push(entry);
  }

  for (const [key, bandEntries] of byBand.entries()) {
    const [start, end] = key.split('-').map(Number);
    const availableSeeds = [];

    for (let seed = start; seed <= end; seed++) {
      if (seedSlots.has(seed)) availableSeeds.push(seed);
    }

    let arranged = [...bandEntries];

    // 1 i 2 queden fixos. La resta de la banda es sorteja.
    if (!(start === end && (start === 1 || start === 2))) {
      arranged = shuffle(arranged);
    }

    arranged.forEach((entry, index) => {
      const seed = availableSeeds[index];
      if (!seed) return;
      const slot = seedSlots.get(seed);
      slots[slot] = entry;
    });
  }

  return slots;
}

function drawEntries(entries, primaryPosition) {
  const bracketSize = nextPowerOfTwo(entries.length);
  const primary = entries
    .filter(e => e.posicio_grup === primaryPosition)
    .sort((a, b) => a.grup_numero - b.grup_numero)
    .map(e => ({ ...e, seed: e.grup_numero }));

  const secondary = entries
    .filter(e => e.posicio_grup !== primaryPosition)
    .sort((a, b) =>
      a.posicio_grup - b.posicio_grup ||
      a.grup_numero - b.grup_numero
    );

  const slots = placeSeededPrimary(primary, bracketSize);

  const byeCount = bracketSize - entries.length;

  // Els BYEs beneficien primer els caps de sèrie de més pes.
  const reservedByeSlots = new Set();
  const primaryByStrength = [...primary].sort((a, b) => a.seed - b.seed);

  for (const entry of primaryByStrength) {
    if (reservedByeSlots.size >= byeCount) break;

    const slot = slots.findIndex(x => x?.idparticipant === entry.idparticipant);
    if (slot <= 0) continue;

    const opponent = slot % 2 === 1 ? slot + 1 : slot - 1;

    if (opponent >= 1 && opponent <= bracketSize && !slots[opponent]) {
      reservedByeSlots.add(opponent);
    }
  }

  for (const entry of secondary) {
    const candidates = [];

    for (let slot = 1; slot <= bracketSize; slot++) {
      if (slots[slot]) continue;
      if (reservedByeSlots.has(slot)) continue;

      const sameGroupSlots = [];
      for (let other = 1; other <= bracketSize; other++) {
        if (slots[other]?.grup_numero === entry.grup_numero) {
          sameGroupSlots.push(other);
        }
      }

      const opponent = slot % 2 === 1 ? slot + 1 : slot - 1;
      const directRematch =
        slots[opponent]?.grup_numero === entry.grup_numero;

      let minimumMeetingRound = 99;
      for (const other of sameGroupSlots) {
        minimumMeetingRound = Math.min(
          minimumMeetingRound,
          meetingRound(slot, other, bracketSize)
        );
      }

      if (!sameGroupSlots.length) minimumMeetingRound = 99;

      // Primer evitem completament primera ronda del mateix grup.
      // Després intentem que qualsevol reenfrontament sigui tan tard com sigui possible.
      const score =
        (directRematch ? -1000000 : 0) +
        minimumMeetingRound * 10000 +
        Math.random() * 100;

      candidates.push({ slot, score });
    }

    // Si tots els espais lliures són BYEs reservats, els podem utilitzar
    // començant pels de menys prioritat.
    if (!candidates.length) {
      for (let slot = 1; slot <= bracketSize; slot++) {
        if (!slots[slot]) {
          candidates.push({ slot, score: Math.random() * 10 });
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    slots[candidates[0].slot] = entry;
    reservedByeSlots.delete(candidates[0].slot);
  }

  return {
    bracketSize,
    slots
  };
}

async function propagateWinner(connection, matchId, winnerId) {
  const [[match]] = await connection.query(`
    SELECT
      p.idpartit,
      p.idfase,
      p.idronda,
      p.numero_partit,
      r.ordre AS ronda_ordre
    FROM partits p
    INNER JOIN rondes r ON r.idronda = p.idronda
    WHERE p.idpartit = ?
  `, [matchId]);

  if (!match?.idfase || !match?.idronda) return;

  const [[nextRound]] = await connection.query(`
    SELECT idronda, ordre
    FROM rondes
    WHERE idfase = ?
      AND ordre = ?
  `, [match.idfase, Number(match.ronda_ordre) + 1]);

  if (!nextRound) return; // final

  const [currentRoundMatches] = await connection.query(`
    SELECT idpartit
    FROM partits
    WHERE idronda = ?
    ORDER BY numero_partit, idpartit
  `, [match.idronda]);

  const index = currentRoundMatches.findIndex(
    m => Number(m.idpartit) === Number(matchId)
  );

  if (index < 0) return;

  const nextIndex = Math.floor(index / 2);

  const [nextMatches] = await connection.query(`
    SELECT *
    FROM partits
    WHERE idronda = ?
    ORDER BY numero_partit, idpartit
  `, [nextRound.idronda]);

  const nextMatch = nextMatches[nextIndex];
  if (!nextMatch) return;

  if (
    nextMatch.estat === 'FINALITZAT' &&
    Number(nextMatch.guanyador || 0) > 0
  ) {
    throw new Error(
      'No es pot canviar aquest resultat perquè la ronda següent ja té un resultat desat.'
    );
  }

  const field = index % 2 === 0 ? 'participant1' : 'participant2';

  await connection.query(`
    UPDATE partits
    SET ${field} = ?,
        estat = CASE
          WHEN participant1 IS NOT NULL OR participant2 IS NOT NULL
          THEN 'PENDENT'
          ELSE estat
        END
    WHERE idpartit = ?
  `, [winnerId, nextMatch.idpartit]);
}

async function createPhase(categoryId, phaseKind) {
  const standings = await loadGroupStandings(categoryId);

  if (!standings.length) {
    throw new Error('No hi ha classificacions de grup disponibles.');
  }

  let entries;
  let primaryPosition;
  let phaseName;
  let phaseOrder;

  if (phaseKind === 'A') {
    entries = standings.filter(x => x.posicio_grup <= 2);
    primaryPosition = 1;
    phaseName = 'Final A';
    phaseOrder = 1;
  } else if (phaseKind === 'B') {
    entries = standings.filter(x => x.posicio_grup >= 3);
    primaryPosition = Math.min(...entries.map(x => x.posicio_grup));
    phaseName = 'Consolació';
    phaseOrder = 2;
  } else {
    throw new Error('Tipus de quadre no vàlid.');
  }

  if (entries.length < 2) {
    throw new Error(`No hi ha prou participants per generar ${phaseName}.`);
  }

  const { bracketSize, slots } = drawEntries(entries, primaryPosition);

  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [[existingPhase]] = await connection.query(`
      SELECT idfase
      FROM fases
      WHERE idcategoria = ?
        AND nom = ?
    `, [categoryId, phaseName]);

    if (existingPhase) {
      const [[played]] = await connection.query(`
        SELECT COUNT(*) AS total
        FROM partits
        WHERE idfase = ?
          AND estat = 'FINALITZAT'
          AND COALESCE(bye,0) = 0
      `, [existingPhase.idfase]);

      if (Number(played.total || 0) > 0) {
        throw new Error(
          `${phaseName} ja té resultats. El sorteig està bloquejat.`
        );
      }

      await connection.query(
        'DELETE FROM partits WHERE idfase = ?',
        [existingPhase.idfase]
      );
      await connection.query(
        'DELETE FROM quadre_posicions WHERE idfase = ?',
        [existingPhase.idfase]
      );
      await connection.query(
        'DELETE FROM classificacions_fase WHERE idfase_desti = ?',
        [existingPhase.idfase]
      );
      await connection.query(
        'DELETE FROM rondes WHERE idfase = ?',
        [existingPhase.idfase]
      );
      await connection.query(
        'DELETE FROM fases WHERE idfase = ?',
        [existingPhase.idfase]
      );
    }

    const [phaseResult] = await connection.query(`
      INSERT INTO fases
        (idcategoria, nom, tipus, ordre, activa)
      VALUES (?, ?, 'ELIMINATORIA', ?, 1)
    `, [categoryId, phaseName, phaseOrder]);

    const phaseId = phaseResult.insertId;

    for (let slot = 1; slot <= bracketSize; slot++) {
      const entry = slots[slot];

      await connection.query(`
        INSERT INTO quadre_posicions
          (idfase, posicio, idparticipant, ranking_sorteig, bye, origen, bloquejat)
        VALUES (?, ?, ?, ?, ?, ?, 0)
      `, [
        phaseId,
        slot,
        entry?.idparticipant || null,
        entry?.posicio_grup === primaryPosition
          ? entry.grup_numero
          : null,
        entry ? 0 : 1,
        entry
          ? `${entry.posicio_grup}r Grup ${entry.grup_numero}`
          : 'BYE'
      ]);
    }

    for (const entry of entries) {
      await connection.query(`
        INSERT INTO classificacions_fase
          (idcategoria, idgrup, idparticipant, posicio_grup, idfase_desti)
        VALUES (?, ?, ?, ?, ?)
      `, [
        categoryId,
        entry.idgrup,
        entry.idparticipant,
        entry.posicio_grup,
        phaseId
      ]);
    }

    const roundIds = [];
    let playersInRound = bracketSize;
    let order = 1;

    while (playersInRound >= 2) {
      const [roundResult] = await connection.query(`
        INSERT INTO rondes
          (idfase, nom, ordre, mida_quadre)
        VALUES (?, ?, ?, ?)
      `, [
        phaseId,
        roundName(playersInRound),
        order,
        bracketSize
      ]);

      roundIds.push(roundResult.insertId);
      playersInRound /= 2;
      order++;
    }

    // Creem tots els partits del quadre.
    for (let r = 0; r < roundIds.length; r++) {
      const matchCount = bracketSize / Math.pow(2, r + 1);

      for (let m = 0; m < matchCount; m++) {
        let participant1 = null;
        let participant2 = null;
        let bye = 0;
        let winner = null;
        let state = 'PENDENT';

        if (r === 0) {
          participant1 = slots[m * 2 + 1]?.idparticipant || null;
          participant2 = slots[m * 2 + 2]?.idparticipant || null;

          if ((participant1 && !participant2) || (!participant1 && participant2)) {
            bye = 1;
            winner = participant1 || participant2;
            state = 'FINALITZAT';
          }
        }

        await connection.query(`
          INSERT INTO partits
            (idcategoria, idfase, idronda, idgrup, numero_partit,
             participant1, participant2, guanyador, resultat1, resultat2,
             estat, bye)
          VALUES (?, ?, ?, NULL, ?, ?, ?, ?, NULL, NULL, ?, ?)
        `, [
          categoryId,
          phaseId,
          roundIds[r],
          m + 1,
          participant1,
          participant2,
          winner,
          state,
          bye
        ]);
      }
    }

    // Propaguem els BYEs de primera ronda.
    const [byeMatches] = await connection.query(`
      SELECT idpartit, guanyador
      FROM partits
      WHERE idfase = ?
        AND idronda = ?
        AND bye = 1
        AND guanyador IS NOT NULL
      ORDER BY numero_partit
    `, [phaseId, roundIds[0]]);

    for (const match of byeMatches) {
      await propagateWinner(
        connection,
        match.idpartit,
        match.guanyador
      );
    }

    await connection.query(`
      INSERT INTO log_canvis
        (accio, entitat, identitat, descripcio)
      VALUES ('SORTEIG_FASE_FINAL', 'fase', ?, ?)
    `, [
      phaseId,
      `${phaseName}: ${entries.length} participants, quadre de ${bracketSize}`
    ]);

    await connection.commit();

    return phaseId;
  } catch (e) {
    await connection.rollback();
    throw e;
  } finally {
    connection.release();
  }
}

module.exports = {
  createPhase,
  loadGroupStandings,
  propagateWinner,
  drawEntries,
  standardSeedOrder,
  nextPowerOfTwo
};
