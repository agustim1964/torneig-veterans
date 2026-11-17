const router = require('express').Router();
const crypto = require('crypto');
const users = require('../services/userService');
const auth = require('../middleware/auth');

// Bound to the signed session so another site cannot submit account changes.
function csrf(req) {
  return crypto.createHmac('sha256', process.env.AUTH_SECRET).update(`users:${req.headers.cookie || ''}`).digest('hex');
}
function render(req, res, error = null) {
  res.render('users/index', {
    title: 'Gestió d’usuaris', error, csrf: csrf(req),
    users: users.list().map(({ username, role, configured }) => ({ username, role, configured }))
  });
}
router.get('/', (req, res) => render(req, res));
router.post('/', (req, res, next) => {
  if (req.body.csrf !== csrf(req)) return res.status(403).send('Formulari caducat. Torna a carregar la pàgina.');
  try {
    if (req.body.action === 'delete') users.remove(req.body.originalUsername, req.user.username);
    else {
      const user = users.update(req.body, req.user.username, req.body.originalUsername || undefined);
      if (req.body.originalUsername === req.user.username) auth.setSessionCookie(req, res, user);
    }
    res.redirect('/users');
  } catch (error) {
    if (error.code || error instanceof SyntaxError) return next(error);
    res.status(400);
    render(req, res, error.message);
  }
});
module.exports = router;
