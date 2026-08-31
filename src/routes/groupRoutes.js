const express = require('express');
const controller = require('../controllers/groupController');

const router = express.Router();

router.get('/category/:categoryId', controller.showByCategory);
router.get('/:id/print', controller.printGroup);
router.post('/category/:categoryId/draw', controller.draw);
router.post('/move', controller.moveParticipant);

module.exports = router;
