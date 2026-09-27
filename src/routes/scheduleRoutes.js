const express = require('express');
const c = require('../controllers/scheduleController');
const r = express.Router();

r.get('/competition/:competitionId', c.show);
r.get('/competition/:competitionId/print', c.print);
r.post('/competition/:competitionId/generate', c.generate);
r.post('/competition/:competitionId/sessions', c.createSession);
r.post('/session/:id/update', c.updateSession);
r.post('/session/:id/delete', c.deleteSession);
r.post('/:id/update', c.update);

module.exports = r;
