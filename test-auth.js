const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const testDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'torneig-users-'));
process.env.USERS_FILE = path.join(testDirectory, 'users.json');

process.env.ADMIN_USERNAME = 'test-admin';
process.env.ADMIN_PASSWORD = 'test-admin-password';
process.env.GUEST_USERNAME = 'test-guest';
process.env.GUEST_PASSWORD = 'test-guest-password';
process.env.AUTH_SECRET = 'test-secret-with-sufficient-length-for-signed-sessions';

const app = require('./src/app');

(async () => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let response = await fetch(`${base}/competitions`, { redirect: 'manual' });
    assert.strictEqual(response.status, 302);
    assert(response.headers.get('location').startsWith('/login'));

    response = await fetch(`${base}/login?lang=ru`);
    assert.strictEqual(response.status, 200);
    assert((await response.text()).includes('Вход в систему турнира'));

    response = await fetch(`${base}/language`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ locale: 'fr', returnTo: '/login' })
    });
    assert.strictEqual(response.status, 302);
    assert(response.headers.get('set-cookie').includes('torneig_locale=fr'));

    response = await fetch(`${base}/login?lang=pt`);
    assert.strictEqual(response.status, 200);
    assert((await response.text()).includes('Acesso ao campeonato'));

    response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'test-guest', password: 'incorrecta' })
    });
    assert.strictEqual(response.status, 401);

    response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username: 'test-guest', password: 'test-guest-password' })
    });
    assert.strictEqual(response.status, 302);
    const guestCookie = response.headers.get('set-cookie').split(';')[0];

    response = await fetch(`${base}/tables`, { redirect: 'manual', headers: { cookie: guestCookie } });
    assert.strictEqual(response.status, 403);

    response = await fetch(`${base}/users`, { redirect: 'manual', headers: { cookie: guestCookie } });
    assert.strictEqual(response.status, 403);
    response = await fetch(`${base}/users`, { method: 'POST', redirect: 'manual', headers: { cookie: guestCookie } });
    assert.strictEqual(response.status, 403);

    const login = async (username, password) => fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ username, password })
    });
    response = await login('test-admin', 'test-admin-password');
    const adminCookie = response.headers.get('set-cookie').split(';')[0];
    response = await fetch(`${base}/users`, { headers: { cookie: adminCookie } });
    assert.strictEqual(response.status, 200);
    const page = await response.text();
    const csrf = page.match(/name="csrf" value="([^"]+)"/)[1];
    const change = async (values, token = csrf) => fetch(`${base}/users`, {
      method: 'POST', redirect: 'manual',
      headers: { cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ ...values, csrf: token })
    });
    response = await change({ username: 'new-user', password: 'long-password', role: 'guest' }, 'invalid');
    assert.strictEqual(response.status, 403);
    response = await change({ username: 'new-user', password: 'long-password', role: 'guest' });
    assert.strictEqual(response.status, 302);
    assert(!fs.readFileSync(process.env.USERS_FILE, 'utf8').includes('long-password'));
    response = await change({ username: 'NEW-USER', password: 'long-password', role: 'admin' });
    assert.strictEqual(response.status, 400);
    response = await login('new-user', 'long-password');
    assert.strictEqual(response.status, 302);
    const newCookie = response.headers.get('set-cookie').split(';')[0];
    response = await fetch(`${base}/users`, { headers: { cookie: newCookie } });
    assert.strictEqual(response.status, 403);
    response = await change({ originalUsername: 'new-user', username: 'new-user', password: '', role: 'admin' });
    assert.strictEqual(response.status, 302);
    response = await fetch(`${base}/users`, { redirect: 'manual', headers: { cookie: newCookie } });
    assert.strictEqual(response.status, 302); // Old session revoked after role change.
    response = await login('new-user', 'long-password');
    const promotedCookie = response.headers.get('set-cookie').split(';')[0];
    response = await fetch(`${base}/users`, { headers: { cookie: promotedCookie } });
    assert.strictEqual(response.status, 200);
    response = await change({ originalUsername: 'new-user', username: 'new-user', password: 'replacement-password', role: 'admin' });
    assert.strictEqual(response.status, 302);
    response = await login('new-user', 'long-password');
    assert.strictEqual(response.status, 401);
    response = await login('new-user', 'replacement-password');
    assert.strictEqual(response.status, 302);
    response = await change({ originalUsername: 'test-admin', action: 'delete' });
    assert.strictEqual(response.status, 400);
    response = await change({ originalUsername: 'new-user', action: 'delete' });
    assert.strictEqual(response.status, 302);
    response = await login('new-user', 'replacement-password');
    assert.strictEqual(response.status, 401);
    response = await fetch(`${base}/users`, { redirect: 'manual', headers: { cookie: promotedCookie } });
    assert.strictEqual(response.status, 302);

    response = await fetch(`${base}/competitions`, {
      method: 'POST', redirect: 'manual', headers: { cookie: guestCookie }
    });
    assert.strictEqual(response.status, 403);

    response = await fetch(`${base}/logout`, {
      method: 'POST', redirect: 'manual', headers: { cookie: guestCookie }
    });
    assert.strictEqual(response.status, 302);
    assert.strictEqual(response.headers.get('location'), '/login');

    console.log('Autenticació: accés, sessió signada i permisos de convidat correctes.');
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    fs.rmSync(testDirectory, { recursive: true, force: true });
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
