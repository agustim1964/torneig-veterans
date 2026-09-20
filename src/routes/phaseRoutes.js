const express = require('express');
const controller = require('../controllers/phaseController');

const router = express.Router();

router.get('/category/:categoryId', controller.show);
router.get('/round/:roundId/print', controller.printRoundSheets);
router.get('/:phaseId/print-bracket', controller.printBracket);
router.post('/category/:categoryId/generate', controller.generate);
router.post('/:phaseId/swap-players', controller.swapPlayers);
router.post('/match/:matchId/schedule', controller.scheduleMatch);

module.exports = router;
