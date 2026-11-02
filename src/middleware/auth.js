const crypto = require('crypto');

const COOKIE_NAME = 'torneig_session';
const SESSION_DURATION_SECONDS = 12 * 60 * 60;

function secret() {
  if (!process.env.AUTH_SECRET || process.env.AUTH_SECRET.length < 32) {
    throw new Error('AUTH_SECRET ha de tenir com a mínim 32 caràcters.');
  }
  return process.env.AUTH_SECRET;
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function sign(value) {
  return crypto.createHmac('sha256', secret()).update(value).digest('base64url');
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function createToken(user) {
  const payload = encode(JSON.stringify({
    username: user.username,
    role: user.role,
    expiresAt: Date.now() + SESSION_DURATION_SECONDS * 1000
  }));
  return `${payload}.${sign(payload)}`;
}

function readToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  if (!safeEqual(sign(payload), signature)) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!user.username || !['admin', 'guest'].includes(user.role) || user.expiresAt <= Date.now()) return null;
    return user;
  } catch {
    return null;
  }
}

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(item => {
    const separator = item.indexOf('=');
    if (separator < 0) return ['', ''];
    return [item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1))];
  }).filter(([name]) => name));
}

function configuredUsers() {
  return [
    { username: process.env.ADMIN_USERNAME || '', password: process.env.ADMIN_PASSWORD || '', role: 'admin' },
    { username: process.env.GUEST_USERNAME || 'guest', password: process.env.GUEST_PASSWORD || '', role: 'guest' }
  ];
}

function authenticate(username, password) {
  return configuredUsers().find(user => user.username && user.password &&
    safeEqual(user.username, username) && safeEqual(user.password, password)) || null;
}

function setSessionCookie(req, res, user) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.cookie(COOKIE_NAME, createToken(user), {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_DURATION_SECONDS * 1000,
    path: '/'
  });
}

function clearSessionCookie(req, res) {
  const secure = req.secure || req.get('x-forwarded-proto') === 'https';
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}

function loadUser(req, res, next) {
  req.user = readToken(cookies(req)[COOKIE_NAME]);
  res.locals.currentUser = req.user;
  next();
}

function requireAuthentication(req, res, next) {
  if (req.user) return next();
  const returnTo = req.method === 'GET' ? req.originalUrl : '/competitions';
  return res.redirect(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}

const guestReadableRoutes = [
  /^\/competitions(?:\/\d+(?:\/groups|\/honor-board)?)?\/?$/,
  /^\/categories(?:\/\d+)?\/?$/,
  /^\/groups\/category\/\d+(?:\/print)?\/?$/,
  /^\/groups\/\d+\/print\/?$/,
  /^\/phases\/category\/\d+(?:\/print-brackets)?\/?$/,
  /^\/phases\/round\/\d+\/print\/?$/,
  /^\/phases\/\d+\/print-bracket\/?$/
];

function authorizeRequest(req, res, next) {
  if (req.user.role === 'admin') return next();
  const path = req.path;
  if ((req.method === 'GET' || req.method === 'HEAD') && guestReadableRoutes.some(pattern => pattern.test(path))) return next();
  return res.status(403).render('auth/forbidden', { title: 'Accés restringit' });
}

module.exports = { authenticate, setSessionCookie, clearSessionCookie, loadUser, requireAuthentication, authorizeRequest };
