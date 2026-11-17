const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const file = () => process.env.USERS_FILE || path.join(__dirname, '../../data/users.json');
function configuredUsers() {
  return [
    { username: process.env.ADMIN_USERNAME || '', password: process.env.ADMIN_PASSWORD || '', role: 'admin' },
    { username: process.env.GUEST_USERNAME || 'guest', password: process.env.GUEST_PASSWORD || '', role: 'guest' }
  ].filter(user => user.username && user.password).map(user => ({ ...user, configured: true }));
}
function storedUsers() {
  try { return JSON.parse(fs.readFileSync(file(), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
}
function list() {
  return [...configuredUsers(), ...storedUsers()];
}
function save(users) {
  fs.mkdirSync(path.dirname(file()), { recursive: true, mode: 0o700 });
  const temporary = `${file()}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, JSON.stringify(users, null, 2), { mode: 0o600 });
  fs.renameSync(temporary, file());
}
function hash(password, salt) {
  return crypto.scryptSync(password, salt, 64).toString('hex');
}
function authenticate(username, password) {
  if (typeof username !== 'string' || typeof password !== 'string' || password.length > 256) return null;
  const user = list().find(item => item.username === username);
  if (!user) return null;
  const expected = user.configured ? crypto.createHash('sha256').update(user.password).digest() : Buffer.from(user.hash, 'hex');
  const actual = user.configured ? crypto.createHash('sha256').update(password).digest() : Buffer.from(hash(password, user.salt), 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual) ? user : null;
}
function update(input, actor, existingUsername) {
  const username = typeof input.username === 'string' ? input.username.trim() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!/^[\p{L}\p{N}_.@-]{3,64}$/u.test(username)) throw new Error('L’usuari ha de tenir entre 3 i 64 lletres, números o signes _.@-');
  if (!['admin', 'guest'].includes(input.role)) throw new Error('Selecciona un rol vàlid.');
  const users = storedUsers();
  const existing = existingUsername && users.find(user => user.username === existingUsername);
  if (existingUsername && !existing) throw new Error('Aquest compte no es pot modificar des d’aquesta pantalla.');
  if (existingUsername === actor && (username !== actor || input.role !== 'admin')) throw new Error('No pots canviar el teu propi nom ni treure’t el rol d’administrador.');
  if (list().some(user => user.username.toLowerCase() === username.toLowerCase() && (!existing || user.username !== existing.username))) throw new Error('Aquest nom d’usuari ja existeix.');
  if ((!existing || password) && (password.length < 10 || password.length > 256)) throw new Error('La contrasenya ha de tenir entre 10 i 256 caràcters.');
  const user = { ...existing, username, role: input.role, version: crypto.randomUUID() };
  if (password) { user.salt = crypto.randomBytes(16).toString('hex'); user.hash = hash(password, user.salt); }
  save(existing ? users.map(item => item === existing ? user : item) : [...users, user]);
  return user;
}
function remove(username, actor) {
  if (username === actor) throw new Error('No pots eliminar el teu propi compte.');
  const users = storedUsers();
  if (!users.some(user => user.username === username)) throw new Error('Aquest compte no es pot eliminar des d’aquesta pantalla.');
  save(users.filter(user => user.username !== username));
}
module.exports = { list, authenticate, update, remove };
