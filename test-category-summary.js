const assert = require('assert');
const { buildCategorySummary } = require('./src/services/categorySummaryService');

const summary = buildCategorySummary([
  { idcategoria: 1, nom: '+60', participants: '9' },
  { idcategoria: 2, nom: '+70', participants: '12' },
  { idcategoria: 3, nom: 'Dobles', participants: '5' }
], [
  { idcategoria: 1, participants: '4' },
  { idcategoria: 1, participants: '5' },
  { idcategoria: 2, participants: '3' },
  { idcategoria: 2, participants: '8' }
]);
assert.deepStrictEqual(summary.sizes, [3, 4, 5, 6, 7, 8]);
assert.deepStrictEqual(summary.rows[0].sizes, { 4: 1, 5: 1 });
assert.strictEqual(summary.rows[0].matches, 16);
assert.strictEqual(summary.rows[1].groupedParticipants, 11);
assert.strictEqual(summary.rows[2].groupCount, 0);
assert.deepStrictEqual(summary.totals, {
  participants: 26, groupCount: 4, groupedParticipants: 20, matches: 47,
  sizes: { 3: 1, 4: 1, 5: 1, 8: 1 }
});
const empty = buildCategorySummary([], []);
assert.strictEqual(empty.totals.participants, 0);
assert.deepStrictEqual(empty.rows, []);
console.log('Resum de categories: recomptes, totals, mides i categories sense sorteig correctes.');
