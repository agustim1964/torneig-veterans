const assert = require('assert');
const path = require('path');
const ejs = require('ejs');
const { buildPlacementPlan, evaluateMatches, validateLimit, configurePlacement } = require('./src/services/placementService');
const { standardSeedOrder } = require('./src/services/phaseService');

function fixture(slots, limit) {
  const rounds = [];
  let id = 0;
  for (let size = slots.length; size >= 2; size /= 2) {
    rounds.push({ idronda: rounds.length + 1, matches: Array.from({ length: size / 2 }, (_, i) => ({
      idpartit: ++id, idronda: rounds.length + 1, numero_partit: i + 1,
      participant1: null, participant2: null, guanyador: null, resultat1: null, resultat2: null, estat: 'PENDENT', bye: 0
    })) });
  }
  const plan = buildPlacementPlan(rounds, slots, limit);
  const ids = new Map();
  const placements = [];
  const origin = ref => typeof ref.match === 'number' ? ref.match : ids.get(ref.match);
  for (const node of plan.matches) {
    const match = { idpartit: ++id, idronda: rounds.length + 1, numero_partit: 1,
      participant1: null, participant2: null, guanyador: null, resultat1: null, resultat2: null, estat: 'PENDENT', bye: 0 };
    ids.set(node.key, match.idpartit);
    rounds.push({ idronda: match.idronda, matches: [match] });
    placements.push({ idpartit: match.idpartit, origen1_partit: origin(node.left), origen1_resultat: node.left.outcome,
      origen2_partit: origin(node.right), origen2_resultat: node.right.outcome });
  }
  return { rounds, slots, placements, plan, origin };
}

function sync(graph) {
  const evaluated = evaluateMatches(graph.rounds, graph.slots, graph.placements);
  for (const update of evaluated.updates) {
    const match = graph.rounds.flatMap(round => round.matches).find(match => match.idpartit === update.idpartit);
    Object.assign(match, update, { resultat1: null, resultat2: null });
  }
  return evaluated;
}

function finish(graph) {
  for (let step = 0; step < 50; step++) {
    sync(graph);
    const ready = graph.rounds.flatMap(round => round.matches).filter(match => !match.bye && match.estat !== 'FINALITZAT' && match.participant1 && match.participant2);
    if (!ready.length) return sync(graph);
    for (const match of ready) Object.assign(match, { guanyador: Math.min(match.participant1, match.participant2),
      resultat1: match.participant1 < match.participant2 ? 3 : 0, resultat2: match.participant2 < match.participant1 ? 3 : 0, estat: 'FINALITZAT' });
  }
  throw new Error('No es resol el quadre.');
}

async function run() {
  assert.strictEqual(validateLimit('7', 12, 'INDIVIDUAL', 'Final A'), 7);
  for (const value of ['', 0, 1, 2.5, 9, 'abc', Infinity]) assert.throws(() => validateLimit(value, 8, 'INDIVIDUAL', 'Final A'));
  assert.throws(() => validateLimit(4, 8, 'DOBLES', 'Final A'), /individuals/);
  assert.throws(() => validateLimit(4, 8, 'INDIVIDUAL', 'Consolació'), /Quadre A/);
  let scenarios = 0;
  for (let total = 2; total <= 40; total++) {
    let size = 2; while (size < total) size *= 2;
    const slots = standardSeedOrder(size).map(seed => seed <= total ? seed : null);
    for (let limit = 2; limit <= total; limit++) {
      const graph = fixture(slots, limit);
      const evaluated = finish(graph);
      const ranked = graph.plan.positions.map(row => evaluated.outcomes.get(graph.origin(row.source))[row.source.outcome].id);
      assert.deepStrictEqual(graph.plan.positions.map(row => row.position), Array.from({ length: limit }, (_, i) => i + 1));
      assert.strictEqual(new Set(ranked).size, limit, `Duplicats: ${total}/${limit}`);
      assert(ranked.every(id => id && slots.includes(id)));
      assert.deepStrictEqual(ranked.slice(0, 2), [1, 2], `Final: ${total}/${limit}`);
      assert(graph.rounds.flatMap(round => round.matches).every(match => match.estat === 'FINALITZAT'));
      scenarios++;
    }
    // També contempla BYE concentrats en una mateixa branca del quadre.
    const graph = fixture(Array.from({ length: size }, (_, i) => i < total ? i + 1 : null), total);
    const evaluated = finish(graph);
    const ranked = graph.plan.positions.map(row => evaluated.outcomes.get(graph.origin(row.source))[row.source.outcome].id);
    assert.strictEqual(new Set(ranked).size, total);
    assert(ranked.every(Boolean));
  }
  const counts = [[2, 0], [3, 1], [4, 1], [5, 4], [6, 4], [7, 5], [8, 5]];
  for (const [limit, extra] of counts) assert.strictEqual(fixture([1, 8, 5, 4, 3, 6, 7, 2], limit).placements.length, extra);

  const pending = fixture([1, 8, 5, 4, 3, 6, 7, 2], 8);
  sync(pending);
  assert(pending.rounds.slice(1).flatMap(round => round.matches).every(match => !match.bye && !match.guanyador), 'Desconegut no és BYE');
  const first = pending.rounds[0].matches[0];
  Object.assign(first, { guanyador: first.participant1, resultat1: 3, resultat2: 0, estat: 'FINALITZAT' });
  sync(pending);
  const child = pending.rounds[1].matches[0];
  assert.strictEqual(child.participant1, first.participant1);
  assert.strictEqual(child.bye, 0);
  Object.assign(child, { resultat1: 1, resultat2: 0, has_games: 1 });
  Object.assign(first, { guanyador: first.participant2 });
  assert.throws(() => sync(pending), /posterior.*parcial/);
  Object.assign(child, { resultat1: null, resultat2: null, has_games: 0 });
  sync(pending);
  assert.strictEqual(child.participant1, first.participant2);
  Object.assign(first, { guanyador: null, resultat1: null, resultat2: null, estat: 'PENDENT' });
  sync(pending);
  assert.strictEqual(child.participant1, null, 'Esborrar resultat retira el jugador de la ronda següent');

  const bronzeOnly = fixture([1, 4, 3, 2], 4);
  sync(bronzeOnly);
  for (const match of bronzeOnly.rounds[0].matches) Object.assign(match, { guanyador: match.participant1, estat: 'FINALITZAT', resultat1: 3, resultat2: 0 });
  sync(bronzeOnly);
  const bronze = bronzeOnly.rounds.at(-1).matches[0];
  Object.assign(bronze, { resultat1: 1, resultat2: 0, has_games: 1 });
  const semifinal = bronzeOnly.rounds[0].matches[0];
  semifinal.guanyador = semifinal.participant2;
  assert.throws(() => sync(bronzeOnly), /posterior/, 'El resultat parcial del bronze bloqueja canviar el perdedor de la semifinal encara que la final estigui pendent');

  const completed = fixture([1, 8, 5, 4, 3, 6, 7, 2], 8);
  finish(completed);
  const original = completed.rounds[0].matches[0];
  original.guanyador = original.participant2;
  assert.throws(() => sync(completed), /posterior/, 'Protegeix els resultats dels partits dependents');

  await persistenceScenario();
  await resultTransactions();
  await renderViews();
  console.log(`Classificació individual: ${scenarios} quadres/límits, BYE, propagació, bloqueigs, persistència i impressió correctes.`);
}

async function persistenceScenario() {
  const graph = fixture([1, 8, 5, 4, 3, 6, 7, 2], 2);
  finish(graph);
  const mainBefore = JSON.stringify(graph.rounds);
  let config;
  let type = 'INDIVIDUAL';
  let phaseName = 'Final A';
  let matchId = 100;
  const positions = [];
  const queries = [];
  const fake = { query: async (sql, params) => {
    sql = sql.trim(); queries.push(sql);
    if (sql.startsWith('SELECT f.*')) return [[{ idfase: 1, idcategoria: 2, categoria_tipus: type, nom: phaseName }]];
    if (sql.startsWith('SELECT p.*, r.ordre')) return [graph.rounds.flatMap((round, i) => round.matches.map(match => ({ ...match, ronda_ordre: i + 1 })))];
    if (sql.startsWith('SELECT posicio, idparticipant')) return [graph.slots.map((idparticipant, i) => ({ posicio: i + 1, idparticipant }))];
    if (sql.startsWith('SELECT * FROM classificacio_partits')) return [graph.placements];
    if (sql.startsWith('SELECT fins_posicio')) return [config ? [config] : []];
    if (sql.startsWith('DELETE FROM classificacio_posicions')) { positions.length = 0; return [{}]; }
    if (sql.startsWith('INSERT INTO classificacio_fases')) { config = { fins_posicio: params[1] }; return [{}]; }
    if (sql.startsWith('INSERT INTO rondes')) { const idronda = 10 + graph.rounds.length; graph.rounds.push({ idronda, matches: [] }); return [{ insertId: idronda }]; }
    if (sql.startsWith('INSERT INTO partits')) {
      const match = { idpartit: ++matchId, idronda: params[2], numero_partit: params[3], participant1: null, participant2: null,
        guanyador: null, resultat1: null, resultat2: null, estat: 'PENDENT', bye: 0 };
      graph.rounds.find(round => round.idronda === match.idronda).matches.push(match);
      return [{ insertId: match.idpartit }];
    }
    if (sql.startsWith('INSERT INTO classificacio_partits')) {
      graph.placements.push({ idpartit: params[0], origen1_partit: params[4], origen1_resultat: params[5], origen2_partit: params[6], origen2_resultat: params[7] }); return [{}];
    }
    if (sql.startsWith('INSERT INTO classificacio_posicions')) { positions.push(params); return [{}]; }
    if (sql.startsWith('INSERT INTO log_canvis')) return [{}];
    if (sql.startsWith('UPDATE partits SET participant1')) {
      const match = graph.rounds.flatMap(round => round.matches).find(match => match.idpartit === params[5]);
      Object.assign(match, { participant1: params[0], participant2: params[1], guanyador: params[2], estat: params[3], bye: params[4] }); return [{}];
    }
    throw new Error(`Consulta inesperada: ${sql}`);
  } };
  await configurePlacement(fake, 1, 8);
  assert.strictEqual(config.fins_posicio, 8);
  assert.strictEqual(positions.length, 8);
  assert.strictEqual(graph.placements.length, 5);
  assert.strictEqual(JSON.stringify(graph.rounds.slice(0, 3)), mainBefore, 'Conserva resultats del quadre existent');
  const beforeRepeat = graph.rounds.length;
  await configurePlacement(fake, 1, 8);
  assert.strictEqual(graph.rounds.length, beforeRepeat, 'Aplicar el mateix límit no regenera partits');
  finish(graph);
  await assert.rejects(configurePlacement(fake, 1, 4), /ja hi ha resultats/);
  type = 'DOBLES';
  await assert.rejects(configurePlacement(fake, 1, 4), /individuals/);
  type = 'INDIVIDUAL'; phaseName = 'Consolació';
  await assert.rejects(configurePlacement(fake, 1, 4), /Quadre A/);
  assert(queries[0].includes('FOR UPDATE'));
}

async function resultTransactions() {
  const db = require('./src/config/db');
  const controller = require('./src/controllers/matchController');
  const graph = fixture([1, 4, 3, 2], 4);
  finish(graph);
  const allMatches = () => graph.rounds.flatMap(round => round.matches);
  const snapshot = JSON.stringify(graph.rounds);
  let committed = false;
  let rolledBack = false;
  const fake = {
    beginTransaction: async () => {},
    commit: async () => { committed = true; },
    rollback: async () => { rolledBack = true; graph.rounds = JSON.parse(snapshot); },
    release: () => {},
    query: async (sql, params) => {
      sql = sql.trim();
      if (sql.startsWith('SELECT pa.participant1')) return [[{ ...allMatches()[0], idfase: 1, categoria_nom: 'M60' }]];
      if (sql.startsWith('SELECT idfase FROM fases')) return [[{ idfase: 1 }]];
      if (sql.startsWith('SELECT participant1, participant2, bye')) return [[allMatches()[0]]];
      if (sql.startsWith('DELETE FROM partit_jocs') || sql.startsWith('INSERT INTO partit_jocs')) return [{}];
      if (sql.startsWith('UPDATE partits') && sql.includes('resultat1 = ?')) {
        const match = allMatches().find(match => match.idpartit === params[4]);
        Object.assign(match, { resultat1: params[0], resultat2: params[1], guanyador: params[2], estat: params[3] }); return [{}];
      }
      if (sql.startsWith('SELECT idfase FROM partits')) return [[{ idfase: 1 }]];
      if (sql.startsWith('SELECT p.*, r.ordre')) return [allMatches()];
      if (sql.startsWith('SELECT posicio, idparticipant')) return [graph.slots.map((idparticipant, i) => ({ posicio: i + 1, idparticipant }))];
      if (sql.startsWith('SELECT * FROM classificacio_partits')) return [graph.placements];
      throw new Error(`Consulta inesperada al resultat: ${sql}`);
    }
  };
  const originalQuery = db.query;
  const originalConnection = db.getConnection;
  db.query = fake.query;
  db.getConnection = async () => fake;
  try {
    const body = { categoryId: '1', returnTo: 'phases', ajax: '1', joc1_p1: '0', joc1_p2: '11', joc2_p1: '0', joc2_p2: '11', joc3_p1: '0', joc3_p2: '11' };
    const response = { status(code) { this.code = code; return this; }, json(value) { this.value = value; } };
    await controller.saveResult({ params: { id: String(allMatches()[0].idpartit) }, body }, response);
    assert.strictEqual(response.code, 400);
    assert.match(response.value.error, /posterior/);
    assert(rolledBack && !committed);
    assert.strictEqual(JSON.stringify(graph.rounds), snapshot, 'La correcció bloquejada fa rollback de tots els resultats');
    rolledBack = false;
    await controller.saveResult({ params: { id: String(allMatches()[0].idpartit) }, body: { categoryId: '1', ajax: '1' } }, response);
    assert.strictEqual(response.code, 400);
    assert(rolledBack && !committed, 'Retirar un resultat també respecta els partits posteriors');
    rolledBack = false;
    await controller.saveResult({ params: { id: String(allMatches()[0].idpartit) }, body: { ...body,
      joc1_p1: '11', joc1_p2: '1', joc2_p1: '11', joc2_p2: '1', joc3_p1: '11', joc3_p2: '1' } }, response);
    assert(committed && !rolledBack && response.value.ok, 'Corregir punts conservant guanyador/perdedor no bloqueja els partits posteriors');
  } finally {
    db.query = originalQuery;
    db.getConnection = originalConnection;
  }
}

async function renderViews() {
  const placement = { configured: true, limit: 4, positions: [1, 2, 3, 4].map(posicio => ({ posicio, idparticipant: posicio, nom_mostrar: `Jugador ${posicio}` })) };
  const category = { idcategoria: 1, nom: 'Individual 60', tipus: 'INDIVIDUAL', bestOf: 5, competicio_nom: 'Torneig' };
  const phase = { idfase: 1, nom: 'Final A', positions: placement.positions, rounds: [], placement };
  let html = await ejs.renderFile(path.join(__dirname, 'src/views/phases/index.ejs'), { category, phases: [phase], tables: [], groupsFinished: true, groupStatus: [], t: key => key });
  assert(html.includes('Aplicar classificació') && html.includes('Jugador 4'));
  html = await ejs.renderFile(path.join(__dirname, 'src/views/phases/index.ejs'), { category: { ...category, tipus: 'DOBLES' }, phases: [{ ...phase, placement: { configured: false } }], tables: [], groupsFinished: true, groupStatus: [], t: key => key });
  assert(!html.includes('Aplicar classificació') && !html.includes('name="classificationLimit"'));
  const bracket = { phase: { fase_nom: 'Final A', categoria_nom: 'Individual 60', competicio_nom: 'Torneig' }, rounds: [], classificationRounds: [], bracketSize: 8, placement };
  html = await ejs.renderFile(path.join(__dirname, 'src/views/phases/print-bracket.ejs'), { ...bracket, brackets: [bracket] });
  assert(html.includes('Classificació fins a la posició 4') && html.includes('Jugador 4'));
  html = await ejs.renderFile(path.join(__dirname, 'src/views/competitions/honor-board.ejs'), { competition: { nom: 'Torneig' }, honor: [{ name: 'Individual 60', main: { positions: placement.positions }, consolation: null }] });
  assert(html.includes('Jugador 4') && !html.includes('3r</div>'));
}

run().catch(error => { console.error(error); process.exitCode = 1; });
