/*
 * Carrega resultats de prova a tots els partits de grup de la categoria 7
 * de la competició 1. Executa'l des de l'arrel de torneig-veterans:
 *
 *   node carregar-resultats-prova-cat7.js --execute
 *
 * Abans de modificar res crea un JSON de còpia de seguretat a la carpeta
 * actual. Sense --execute només mostra la planificació i no desa canvis.
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const db = require('./src/config/db');
const { classifyGroup } = require('./src/services/classificationService');

const COMPETITION_ID = 1;
const CATEGORY_ID = 7;
const EXECUTE = process.argv.includes('--execute');
const TARGET_TIES = [5, 4, 3, 2];

let randomState = 710097;
function random() {
  randomState = (randomState * 1664525 + 1013904223) >>> 0;
  return randomState / 0x100000000;
}

function shuffled(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function participantPairs(participants) {
  const pairs = [];
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      pairs.push([participants[i], participants[j]]);
    }
  }
  return pairs;
}

function evaluateOrientation(participants, pairs, orientation, wantedTie) {
  const victories = new Map(participants.map(id => [id, 0]));
  pairs.forEach(([first, second], index) => {
    const winner = orientation[index] ? first : second;
    victories.set(winner, victories.get(winner) + 1);
  });

  const frequencies = new Map();
  for (const wins of victories.values()) {
    frequencies.set(wins, (frequencies.get(wins) || 0) + 1);
  }

  const tiedAt = [...frequencies.entries()]
    .find(([, count]) => count === wantedTie)?.[0];

  return tiedAt === undefined ? null : { orientation, victories, tiedAt };
}

function findTiePattern(participants, wantedTie) {
  if (wantedTie > participants.length) return null;

  const pairs = participantPairs(participants);
  const combinations = 2 ** pairs.length;

  // Fins a 6 jugadors es pot comprovar exhaustivament en molt poc temps.
  if (pairs.length <= 15) {
    for (let mask = 0; mask < combinations; mask++) {
      const orientation = pairs.map((_, index) => Boolean(mask & (2 ** index)));
      const result = evaluateOrientation(participants, pairs, orientation, wantedTie);
      if (result) return { ...result, pairs };
    }
    return null;
  }

  // Per grups excepcionalment grans fem una cerca determinista pseudoaleatòria.
  for (let attempt = 0; attempt < 250000; attempt++) {
    const orientation = pairs.map(() => random() >= 0.5);
    const result = evaluateOrientation(participants, pairs, orientation, wantedTie);
    if (result) return { ...result, pairs };
  }

  return null;
}

function matchTargets(groups, patterns) {
  let best = [];

  function visit(targetIndex, usedGroups, assigned) {
    if (assigned.length > best.length) best = [...assigned];
    if (targetIndex >= TARGET_TIES.length) return;

    const target = TARGET_TIES[targetIndex];
    for (const group of groups) {
      if (usedGroups.has(group.idgrup)) continue;
      const pattern = patterns.get(group.idgrup).get(target);
      if (!pattern) continue;

      usedGroups.add(group.idgrup);
      assigned.push({ group, target, pattern });
      visit(targetIndex + 1, usedGroups, assigned);
      assigned.pop();
      usedGroups.delete(group.idgrup);
    }

    visit(targetIndex + 1, usedGroups, assigned);
  }

  visit(0, new Set(), []);
  return best;
}

function scoreForMatch(winnerIsParticipant1, matchIndex) {
  const losingGames = matchIndex % 3; // resultats 3-0, 3-1 i 3-2
  const gameWinners = losingGames === 0
    ? [true, true, true]
    : losingGames === 1
      ? [true, false, true, true]
      : [true, false, true, false, true];

  const games = gameWinners.map((winnerWinsGame, index) => {
    const winnerPoints = (matchIndex + index) % 7 === 0 ? 12 : 11;
    const loserPoints = winnerPoints === 12
      ? 10
      : 4 + Math.floor(random() * 6);
    const participant1WinsGame = winnerIsParticipant1
      ? winnerWinsGame
      : !winnerWinsGame;

    return participant1WinsGame
      ? { punts1: winnerPoints, punts2: loserPoints }
      : { punts1: loserPoints, punts2: winnerPoints };
  });

  const resultat1 = games.filter(g => g.punts1 > g.punts2).length;
  const resultat2 = games.length - resultat1;
  return { games, resultat1, resultat2 };
}

function safeTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

async function main() {
  const connection = await db.getConnection();

  try {
    const [[category]] = await connection.query(`
      SELECT idcategoria, idcompeticio, nom
      FROM categories
      WHERE idcategoria = ?
    `, [CATEGORY_ID]);

    if (!category) throw new Error(`No existeix la categoria ${CATEGORY_ID}.`);
    if (Number(category.idcompeticio) !== COMPETITION_ID) {
      throw new Error(
        `La categoria ${CATEGORY_ID} pertany a la competició ` +
        `${category.idcompeticio}, no a la ${COMPETITION_ID}.`
      );
    }

    const [groups] = await connection.query(`
      SELECT idgrup, numero
      FROM grups
      WHERE idcategoria = ?
      ORDER BY numero, idgrup
    `, [CATEGORY_ID]);

    if (!groups.length) throw new Error('La categoria no té grups generats.');

    for (const group of groups) {
      const [participants] = await connection.query(`
        SELECT gp.idparticipant, p.nom_mostrar, p.ranking
        FROM grup_participants gp
        INNER JOIN participants p ON p.idparticipant = gp.idparticipant
        WHERE gp.idgrup = ?
        ORDER BY gp.ordre_visual
      `, [group.idgrup]);

      const [matches] = await connection.query(`
        SELECT idpartit, numero_partit, participant1, participant2,
               resultat1, resultat2, guanyador, estat
        FROM partits
        WHERE idgrup = ?
        ORDER BY numero_partit, idpartit
      `, [group.idgrup]);

      const expectedMatches = participants.length * (participants.length - 1) / 2;
      if (matches.length !== expectedMatches) {
        throw new Error(
          `Grup ${group.numero}: hi ha ${matches.length} partits i se n'esperaven ` +
          `${expectedMatches} per a ${participants.length} participants.`
        );
      }

      group.participants = participants;
      group.matches = matches;
    }

    const patterns = new Map();
    for (const group of groups) {
      const ids = group.participants.map(p => Number(p.idparticipant));
      const byTarget = new Map();
      for (const target of TARGET_TIES) {
        byTarget.set(target, findTiePattern(ids, target));
      }
      patterns.set(group.idgrup, byTarget);
    }

    const assignments = matchTargets(groups, patterns);
    const assignmentByGroup = new Map(assignments.map(item => [item.group.idgrup, item]));

    console.log(`Competició ${COMPETITION_ID} · categoria ${CATEGORY_ID}: ${category.nom}`);
    for (const group of groups) {
      const assigned = assignmentByGroup.get(group.idgrup);
      console.log(
        `Grup ${group.numero}: ${group.participants.length} participants` +
        (assigned
          ? ` · empat preparat entre ${assigned.target} jugadors (${assigned.pattern.tiedAt} victòries)`
          : ' · resultats de prova variats')
      );
    }

    const missingTargets = TARGET_TIES.filter(
      target => !assignments.some(item => item.target === target)
    );
    if (missingTargets.length) {
      console.log(
        `No és matemàticament possible preparar empats exactes de ` +
        `${missingTargets.join(', ')} jugadors amb les mides i el nombre de grups disponibles.`
      );
    }

    if (!EXECUTE) {
      console.log('\nSimulació completada. No s’ha modificat res.');
      console.log('Executa amb --execute per desar els resultats.');
      return;
    }

    const allMatchIds = groups.flatMap(group => group.matches.map(m => m.idpartit));
    const placeholders = allMatchIds.map(() => '?').join(',');
    const [oldGames] = await connection.query(`
      SELECT * FROM partit_jocs
      WHERE idpartit IN (${placeholders})
      ORDER BY idpartit, numero_joc
    `, allMatchIds);

    const backup = {
      created_at: new Date().toISOString(),
      competition_id: COMPETITION_ID,
      category_id: CATEGORY_ID,
      matches: groups.flatMap(group => group.matches),
      games: oldGames
    };
    const backupPath = path.resolve(
      `backup-resultats-cat7-${safeTimestamp()}.json`
    );
    fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2), 'utf8');
    console.log(`Còpia de seguretat: ${backupPath}`);

    await connection.beginTransaction();

    let globalMatchIndex = 0;
    for (const group of groups) {
      const ids = group.participants.map(p => Number(p.idparticipant));
      const assigned = assignmentByGroup.get(group.idgrup);
      const chosen = assigned?.pattern || (() => {
        const pairs = participantPairs(ids);
        const orientation = pairs.map(() => random() >= 0.5);
        return { pairs, orientation };
      })();

      const winnerByPair = new Map();
      chosen.pairs.forEach(([first, second], index) => {
        const winner = chosen.orientation[index] ? first : second;
        winnerByPair.set([first, second].sort((a, b) => a - b).join(':'), winner);
      });

      for (const match of group.matches) {
        const p1 = Number(match.participant1);
        const p2 = Number(match.participant2);
        const winner = winnerByPair.get([p1, p2].sort((a, b) => a - b).join(':'));
        if (!winner) throw new Error(`No s'ha pogut decidir el partit ${match.idpartit}.`);

        const score = scoreForMatch(winner === p1, globalMatchIndex++);

        await connection.query(
          'DELETE FROM partit_jocs WHERE idpartit = ?',
          [match.idpartit]
        );

        for (let index = 0; index < score.games.length; index++) {
          const game = score.games[index];
          await connection.query(`
            INSERT INTO partit_jocs
              (idpartit, numero_joc, punts1, punts2)
            VALUES (?, ?, ?, ?)
          `, [match.idpartit, index + 1, game.punts1, game.punts2]);
        }

        await connection.query(`
          UPDATE partits
          SET resultat1 = ?, resultat2 = ?, guanyador = ?, estat = 'FINALITZAT'
          WHERE idpartit = ?
        `, [score.resultat1, score.resultat2, winner, match.idpartit]);
      }
    }

    await connection.commit();

    console.log('\nClassificacions resultants:');
    for (const group of groups) {
      const [matches] = await connection.query(
        'SELECT * FROM partits WHERE idgrup = ? ORDER BY numero_partit',
        [group.idgrup]
      );
      const [games] = await connection.query(`
        SELECT pj.*
        FROM partit_jocs pj
        INNER JOIN partits p ON p.idpartit = pj.idpartit
        WHERE p.idgrup = ?
        ORDER BY pj.idpartit, pj.numero_joc
      `, [group.idgrup]);

      const standings = classifyGroup(group.participants, matches, games);
      console.log(`\nGrup ${group.numero}`);
      standings.forEach(row => {
        const gameFactor = Number.isFinite(row.factor_jocs)
          ? row.factor_jocs?.toFixed(4)
          : '∞';
        const pointFactor = Number.isFinite(row.factor_punts)
          ? row.factor_punts?.toFixed(4)
          : '∞';
        console.log(
          `${row.posicio}. ${row.nom_mostrar}: ${row.victories} victòries` +
          (row.desempat ? ` · mini-taula J=${gameFactor} P=${pointFactor}` : '')
        );
      });
    }

    console.log('\nResultats de prova desats correctament.');
  } catch (error) {
    try { await connection.rollback(); } catch (_) {}
    throw error;
  } finally {
    connection.release();
    await db.end();
  }
}

main().catch(error => {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
});
