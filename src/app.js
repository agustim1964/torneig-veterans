require('dotenv').config();

const express = require('express');
const path = require('path');
const methodOverride = require('method-override');
const auth = require('./middleware/auth');

const categoryRoutes = require('./routes/categoryRoutes');
const participantRoutes = require('./routes/participantRoutes');
const groupRoutes = require('./routes/groupRoutes');
const tableRoutes = require('./routes/tableRoutes');
const competitionRoutes = require('./routes/competitionRoutes');
const matchRoutes = require('./routes/matchRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const phaseRoutes = require('./routes/phaseRoutes');

const app = express();
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.use(auth.loadUser);
app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/competitions');
  res.render('auth/login', { error: null, returnTo: req.query.returnTo || '/competitions' });
});
app.post('/login', (req, res) => {
  const user = auth.authenticate(req.body.username, req.body.password);
  const returnTo = String(req.body.returnTo || '/competitions');
  if (!user) return res.status(401).render('auth/login', { error: 'Usuari o contrasenya incorrectes.', returnTo });
  auth.setSessionCookie(req, res, user);
  return res.redirect(returnTo.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/competitions');
});
app.post('/logout', (req, res) => { auth.clearSessionCookie(req, res); res.redirect('/login'); });
app.use(auth.requireAuthentication);
app.use(auth.authorizeRequest);

app.get('/', (req, res) => res.redirect('/competitions'));

app.use('/competitions', competitionRoutes);
app.use('/categories', categoryRoutes);
app.use('/participants', participantRoutes);
app.use('/groups', groupRoutes);
app.use('/matches', matchRoutes);
app.use('/schedule', scheduleRoutes);
app.use('/phases', phaseRoutes);
app.use('/tables', tableRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).send(`
    <h1>Error</h1>
    <pre>${String(err.message || err)}</pre>
    <p><a href="javascript:history.back()">Tornar</a></p>
  `);
});

const port = Number(process.env.PORT || 3000);

if (require.main === module) app.listen(port, () => console.log(`Torneig Veterans en marxa: http://localhost:${port}`));
module.exports = app;
