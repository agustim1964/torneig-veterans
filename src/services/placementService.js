const db = require('../config/db');

function validateLimit(value, total, categoryType, phaseName) {
  const limit = Number(value);
  if (categoryType !== 'INDIVIDUAL' || phaseName !== 'Final A') {
    throw new Error('La classificació per posicions només està disponible en individuals del Quadre A.');
  }
  if (!Number.isInteger(limit) || limit < 2 || limit > total) {
    throw new Error(`La posició límit ha de ser un enter entre 2 i ${total}.`);
  }
  return limit;
}

const source = (match, outcome = 'GUANYADOR') => ({ match, outcome });

// Els BYE no produeixen perdedors: els intervals es calculen amb jugadors reals.
// Cada grup de perdedors disputa un quadre propi només si afecta el límit demanat.
function buildPlacementPlan(rounds, slots, limit) {
  const matches = [];
  const positions = [];
  let sequence = 0;
  function position(rank, origin) {
    if (rank <= limit) positions.push({ position: rank, source: origin });
  }
  function classify(origins, start) {
    if (!origins.length || start > limit) return;
    if (origins.length === 1) { position(start, origins[0]); return; }
    let size = 2;
    while (size < origins.length) size *= 2;
    let current = [...origins, ...Array(size - origins.length).fill(null)];
    let stage = 1;
    const cohorts = [];
    while (current.length > 1) {
      const next = [];
      const losers = [];
      const alive = current.filter(Boolean).length;
      for (let i = 0; i < current.length; i += 2) {
        const [left, right] = [current[i], current[i + 1]];
        if (!left || !right) { next.push(left || right); continue; }
        const key = `placement-${++sequence}`;
        matches.push({ key, start, end: start + alive - 1, stage, left, right });
        next.push(source(key));
        losers.push(source(key, 'PERDEDOR'));
      }
      cohorts.push({ origins: losers, start: start + next.filter(Boolean).length });
      current = next;
      stage++;
    }
    position(start, current[0]);
    for (const cohort of cohorts) classify(cohort.origins, cohort.start);
  }

  let occupied = slots.map(Boolean);
  const cohorts = [];
  for (const round of rounds) {
    if (round.matches.length * 2 !== occupied.length) throw new Error('L’estructura del quadre principal no és vàlida.');
    const next = [];
    const losers = [];
    round.matches.forEach((match, i) => {
      const left = occupied[i * 2];
      const right = occupied[i * 2 + 1];
      next.push(left || right);
      if (left && right) losers.push(source(match.idpartit, 'PERDEDOR'));
    });
    cohorts.push({ origins: losers, start: next.filter(Boolean).length + 1 });
    occupied = next;
  }
  if (occupied.length !== 1 || !occupied[0]) throw new Error('El quadre principal no té una final vàlida.');
  position(1, source(rounds.at(-1).matches[0].idpartit));
  for (const cohort of cohorts) classify(cohort.origins, cohort.start);
  positions.sort((a, b) => a.position - b.position);
  return { matches, positions };
}

function hasResult(match) {
  return !Number(match.bye) && (match.estat === 'FINALITZAT' || match.resultat1 !== null && match.resultat1 !== undefined ||
    match.resultat2 !== null && match.resultat2 !== undefined || Number(match.has_games));
}

// Avaluació en ordre de dependència. Un participant desconegut no és un BYE.
function evaluateMatches(rounds, slots, placements) {
  const definitions = new Map(placements.map(match => [Number(match.idpartit), match]));
  const mainRounds = rounds.filter(round => !round.matches.some(match => definitions.has(Number(match.idpartit))));
  const nodes = [];
  mainRounds.forEach((round, r) => round.matches.forEach((match, i) => {
    const refs = r === 0
      ? [{ direct: slots[i * 2] || null }, { direct: slots[i * 2 + 1] || null }]
      : [source(mainRounds[r - 1].matches[i * 2].idpartit), source(mainRounds[r - 1].matches[i * 2 + 1].idpartit)];
    nodes.push({ match, refs });
  }));
  for (const round of rounds) for (const match of round.matches) {
    const definition = definitions.get(Number(match.idpartit));
    if (definition) nodes.push({ match, refs: [
      source(definition.origen1_partit, definition.origen1_resultat),
      source(definition.origen2_partit, definition.origen2_resultat)
    ] });
  }
  const outcomes = new Map();
  const updates = [];
  let remaining = nodes;
  while (remaining.length) {
    const waiting = [];
    for (const { match, refs } of remaining) {
      if (refs.some(ref => !('direct' in ref) && !outcomes.has(Number(ref.match)))) {
        waiting.push({ match, refs }); continue;
      }
      const sides = refs.map(ref => 'direct' in ref
        ? { known: true, id: ref.direct }
        : outcomes.get(Number(ref.match))[ref.outcome]);
      const [p1, p2] = sides.map(side => side.id || null);
      const automatic = sides.every(side => side.known) && (!p1 || !p2);
      const changed = Number(match.participant1 || 0) !== Number(p1 || 0) || Number(match.participant2 || 0) !== Number(p2 || 0) ||
        Boolean(Number(match.bye)) !== automatic;
      if (changed && hasResult(match)) {
        throw new Error('No es pot canviar aquest resultat: un partit posterior ja té un resultat desat, complet o parcial.');
      }
      const winner = automatic ? p1 || p2 : changed ? null : match.guanyador;
      const complete = automatic || Boolean(winner && match.estat === 'FINALITZAT' && [Number(p1), Number(p2)].includes(Number(winner)));
      if (changed || automatic && (match.estat !== 'FINALITZAT' || Number(match.guanyador || 0) !== Number(winner || 0))) {
        updates.push({ idpartit: match.idpartit, participant1: p1, participant2: p2, guanyador: winner,
          estat: automatic ? 'FINALITZAT' : 'PENDENT', bye: automatic ? 1 : 0 });
      }
      outcomes.set(Number(match.idpartit), {
        GUANYADOR: { known: complete, id: complete ? winner || null : null },
        PERDEDOR: { known: complete, id: complete && !automatic ? (Number(winner) === Number(p1) ? p2 : p1) : null }
      });
    }
    if (waiting.length === remaining.length) throw new Error('Hi ha dependències invàlides als partits de classificació.');
    remaining = waiting;
  }
  return { updates, outcomes };
}

async function loadGraph(connection, phaseId) {
  const [matches] = await connection.query(`
    SELECT p.*, r.ordre AS ronda_ordre,
      EXISTS(SELECT 1 FROM partit_jocs pj WHERE pj.idpartit = p.idpartit) AS has_games
    FROM partits p JOIN rondes r ON r.idronda = p.idronda
    WHERE p.idfase = ? ORDER BY r.ordre, r.idronda, p.numero_partit, p.idpartit
  `, [phaseId]);
  const [slots] = await connection.query('SELECT posicio, idparticipant FROM quadre_posicions WHERE idfase = ? ORDER BY posicio', [phaseId]);
  const [placements] = await connection.query('SELECT * FROM classificacio_partits WHERE idfase = ?', [phaseId]);
  const rounds = [];
  for (const match of matches) {
    if (rounds.at(-1)?.idronda !== match.idronda) rounds.push({ idronda: match.idronda, matches: [] });
    rounds.at(-1).matches.push(match);
  }
  return { rounds, slots: slots.map(slot => slot.idparticipant), placements };
}

async function synchronizePhase(connection, phaseId) {
  const graph = await loadGraph(connection, phaseId);
  const { updates } = evaluateMatches(graph.rounds, graph.slots, graph.placements);
  for (const match of updates) {
    await connection.query(`UPDATE partits SET participant1 = ?, participant2 = ?, guanyador = ?,
      estat = ?, bye = ?, resultat1 = NULL, resultat2 = NULL WHERE idpartit = ?`,
    [match.participant1, match.participant2, match.guanyador, match.estat, match.bye, match.idpartit]);
  }
}

// El caller obre la transacció. Bloquejar la fase serialitza configuració i resultats.
async function configurePlacement(connection, phaseId, value) {
  const [[phase]] = await connection.query(`SELECT f.*, c.tipus AS categoria_tipus
    FROM fases f JOIN categories c ON c.idcategoria = f.idcategoria WHERE f.idfase = ? FOR UPDATE`, [phaseId]);
  if (!phase) throw new Error('Quadre no trobat.');
  const graph = await loadGraph(connection, phaseId);
  const limit = validateLimit(value, graph.slots.filter(Boolean).length, phase.categoria_tipus, phase.nom);
  const [[config]] = await connection.query('SELECT fins_posicio FROM classificacio_fases WHERE idfase = ?', [phaseId]);
  if (Number(config?.fins_posicio) === limit) return;
  const placementIds = new Set(graph.placements.map(match => Number(match.idpartit)));
  if (graph.rounds.some(round => round.matches.some(match => placementIds.has(Number(match.idpartit)) && hasResult(match)))) {
    throw new Error('No es pot canviar la posició límit: ja hi ha resultats als partits de classificació.');
  }
  const mainRounds = graph.rounds.filter(round => !round.matches.some(match => placementIds.has(Number(match.idpartit))));
  const plan = buildPlacementPlan(mainRounds, graph.slots, limit);
  const oldRoundIds = graph.rounds.filter(round => round.matches.some(match => placementIds.has(Number(match.idpartit)))).map(round => round.idronda);
  for (const roundId of oldRoundIds) {
    await connection.query('DELETE FROM partits WHERE idronda = ?', [roundId]);
    await connection.query('DELETE FROM rondes WHERE idronda = ?', [roundId]);
  }
  await connection.query('DELETE FROM classificacio_posicions WHERE idfase = ?', [phaseId]);
  await connection.query(`INSERT INTO classificacio_fases (idfase, fins_posicio) VALUES (?, ?)
    ON DUPLICATE KEY UPDATE fins_posicio = VALUES(fins_posicio)`, [phaseId, limit]);
  const ids = new Map();
  const roundIds = new Map();
  const numbers = new Map();
  const originId = ref => typeof ref.match === 'number' ? ref.match : ids.get(ref.match);
  for (const match of plan.matches) {
    const group = `${match.start}-${match.end}-${match.stage}`;
    if (!roundIds.has(group)) {
      const name = match.end - match.start === 1 ? `Llocs ${match.start}–${match.end}` : `Llocs ${match.start}–${match.end} · ronda ${match.stage}`;
      const [result] = await connection.query(`INSERT INTO rondes (idfase, nom, ordre, mida_quadre) VALUES (?, ?, ?, ?)`,
        [phaseId, name, mainRounds.length + roundIds.size + 1, match.end - match.start + 1]);
      roundIds.set(group, result.insertId);
    }
    numbers.set(group, (numbers.get(group) || 0) + 1);
    const [result] = await connection.query(`INSERT INTO partits
      (idcategoria, idfase, idronda, idgrup, numero_partit, estat, bye)
      VALUES (?, ?, ?, NULL, ?, 'PENDENT', 0)`, [phase.idcategoria, phaseId, roundIds.get(group), numbers.get(group)]);
    ids.set(match.key, result.insertId);
    await connection.query(`INSERT INTO classificacio_partits
      (idpartit, idfase, posicio_inici, posicio_fi, origen1_partit, origen1_resultat, origen2_partit, origen2_resultat)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [result.insertId, phaseId, match.start, match.end, originId(match.left), match.left.outcome, originId(match.right), match.right.outcome]);
  }
  for (const row of plan.positions) {
    await connection.query(`INSERT INTO classificacio_posicions (idfase, posicio, origen_partit, origen_resultat) VALUES (?, ?, ?, ?)`,
      [phaseId, row.position, originId(row.source), row.source.outcome]);
  }
  await synchronizePhase(connection, phaseId);
  await connection.query(`INSERT INTO log_canvis (accio, entitat, identitat, descripcio)
    VALUES ('CLASSIFICACIO_POSICIONS', 'fase', ?, ?)`, [phaseId, `Classificació individual fins a la posició ${limit}`]);
}

async function loadPlacements(phaseId, connection = db) {
  const [[config]] = await connection.query('SELECT fins_posicio FROM classificacio_fases WHERE idfase = ?', [phaseId]);
  if (!config) return { limit: 2, configured: false, positions: [] };
  const [positions] = await connection.query(`
    SELECT cp.posicio, p.idparticipant, p.nom_mostrar, p.pais
    FROM classificacio_posicions cp
    LEFT JOIN partits m ON m.idpartit = cp.origen_partit AND m.estat = 'FINALITZAT' AND m.guanyador IS NOT NULL
    LEFT JOIN participants p ON p.idparticipant = CASE WHEN cp.origen_resultat = 'GUANYADOR' THEN m.guanyador
      WHEN m.bye = 0 AND m.guanyador = m.participant1 THEN m.participant2
      WHEN m.bye = 0 AND m.guanyador = m.participant2 THEN m.participant1 ELSE NULL END
    WHERE cp.idfase = ? ORDER BY cp.posicio
  `, [phaseId]);
  return { limit: Number(config.fins_posicio), configured: true, positions };
}

module.exports = { validateLimit, buildPlacementPlan, evaluateMatches, configurePlacement, synchronizePhase, loadPlacements };
