require('dotenv').config();

const express = require('express');
const path = require('path');
const methodOverride = require('method-override');

const categoryRoutes = require('./routes/categoryRoutes');
const participantRoutes = require('./routes/participantRoutes');
const groupRoutes = require('./routes/groupRoutes');
const tableRoutes = require('./routes/tableRoutes');
const competitionRoutes = require('./routes/competitionRoutes');
const matchRoutes = require('./routes/matchRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => res.redirect('/competitions'));

app.use('/competitions', competitionRoutes);
app.use('/categories', categoryRoutes);
app.use('/participants', participantRoutes);
app.use('/groups', groupRoutes);
app.use('/matches', matchRoutes);
app.use('/schedule', scheduleRoutes);
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

app.listen(port, () => {
  console.log(`Torneig Veterans en marxa: http://localhost:${port}`);
});
