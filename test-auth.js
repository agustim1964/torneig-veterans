const assert = require('assert');

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
  }
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
