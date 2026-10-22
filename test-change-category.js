const assert = require('assert');
const db = require('./src/config/db');
const { changeCategory } = require('./src/controllers/participantController');

async function scenario({ played = false, incompatible = false, same = false, fail = false } = {}) {
  const calls = [];
  const source = { idcategoria: 1, idcompeticio: 10, tipus: 'INDIVIDUAL', nom: '60' };
  const target = { ...source, idcategoria: 2, nom: '70', idcompeticio: incompatible ? 11 : 10 };
  const connection = {
    beginTransaction: async () => calls.push('begin'),
    commit: async () => calls.push('commit'),
    rollback: async () => calls.push('rollback'),
    release: () => calls.push('release'),
    query: async (sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('SELECT * FROM participants')) return [[{ idparticipant: 7, idcategoria: 1 }]];
      if (sql.includes('SELECT * FROM categories')) return [same ? [source] : [source, target]];
      if (sql.includes('SELECT pa.idpartit')) {
        assert.deepStrictEqual(params, [1, 2, 1, 2]);
        assert(sql.includes('EXISTS (SELECT 1 FROM partit_jocs'));
        assert(sql.includes('COALESCE(pa.bye, 0) = 0'));
        return [played ? [{ idpartit: 20 }] : []];
      }
      if (fail && sql.includes('UPDATE participants')) throw new Error('simulated failure');
      return [[]];
    }
  };
  db.getConnection = async () => connection;
  const res = {
    status(code) { this.code = code; return this; },
    send(message) { this.message = message; },
    redirect(url) { this.url = url; }
  };
  const action = changeCategory({ params: { id: '7' }, body: { idcategoria: same ? '1' : '2' } }, res);
  if (fail) await assert.rejects(action, /simulated failure/);
  else await action;
  assert(calls.includes('release'));
  const deletes = calls.filter(c => c.sql?.includes('DELETE FROM grups'));
  if (played || incompatible) {
    assert.strictEqual(res.code, played ? 409 : 400);
    assert.strictEqual(deletes.length, 0);
    assert(calls.includes('rollback'));
    assert(!calls.includes('commit'));
  } else if (fail) {
    assert(calls.includes('rollback'));
    assert(!calls.includes('commit'));
  } else {
    assert.strictEqual(res.url, `/participants/category/${same ? 1 : 2}`);
    assert.deepStrictEqual(deletes.map(c => c.params[0]), same ? [] : [1, 2]);
    assert(calls.includes('commit'));
  }
}

(async () => {
  for (const options of [{}, { played: true }, { incompatible: true }, { same: true }, { fail: true }]) {
    await scenario(options);
  }
  console.log('Canvi de categoria: trasllat, bloqueig, validació i rollback correctes.');
})().catch(error => { console.error(error); process.exitCode = 1; });
