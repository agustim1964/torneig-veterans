const express = require('express');
const controller = require('../controllers/competitionController');

const router = express.Router();
router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id/config', controller.updateConfig);
router.post('/:id/toggle', controller.toggle);

module.exports = router;
