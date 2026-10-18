const { calculateGroupSizes, drawGroups } = require('./src/services/drawService');
const assert = require('assert');

assert.deepStrictEqual(calculateGroupSizes(23, 4, -1), [4, 4, 4, 4, 4, 3]);
assert.deepStrictEqual(calculateGroupSizes(23, 4, 1), [4, 4, 5, 5, 5]);
assert.deepStrictEqual(calculateGroupSizes(20, 4, 1), [4, 4, 4, 4, 4]);
assert.throws(() => calculateGroupSizes(7, 4, 1), /no es poden/);
assert.throws(() => calculateGroupSizes(23, 4, 0), /Tria grups/);

for (const adjustment of [-1, 1]) {
  for (let n = 3; n <= 8; n++) {
    for (let total = 2; total <= 100; total++) {
      const possible = [];
      for (let count = 0; count * n <= total; count++) {
        if ((total - count * n) % (n + adjustment) === 0) possible.push(count);
      }
      if (!possible.length) {
        assert.throws(() => calculateGroupSizes(total, n, adjustment));
        continue;
      }
      const sizes = calculateGroupSizes(total, n, adjustment);
      assert.strictEqual(sizes.reduce((sum, size) => sum + size, 0), total);
      assert(sizes.every(size => size === n || size === n + adjustment));
      assert.strictEqual(sizes.filter(size => size === n).length, Math.max(...possible));
    }
  }
  const players = Array.from({ length: 23 }, (_, i) => ({
    idparticipant: i + 1, nom_mostrar: `Jugador ${i + 1}`, ranking: 100 - i
  }));
  const groups = drawGroups(players, 4, 4, adjustment);
  assert.deepStrictEqual(groups.map(g => g.participants.length), calculateGroupSizes(23, 4, adjustment));
  assert.strictEqual(new Set(groups.flatMap(g => g.participants.map(p => p.idparticipant))).size, 23);
}

for (const total of [32, 31, 30, 29, 27, 18]) {
  const participants = Array.from({ length: total }, (_, i) => ({
    idparticipant: i + 1,
    nom_mostrar: `Jugador ${i + 1}`,
    ranking: 1000 - i
  }));

  const groups = drawGroups(participants);

  console.log('\n========================================');
  console.log('Participants:', total);
  console.log('Mides:', calculateGroupSizes(total));
  console.log('Grups:', groups.map(g => ({
    grup: g.number,
    jugadors: g.participants.map(p => p.ranking)
  })));
}
