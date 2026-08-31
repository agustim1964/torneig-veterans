const express = require('express');
const controller = require('../controllers/tableController');

const router = express.Router();

router.get('/', controller.list);
router.post('/', controller.create);
router.post('/configure-count', controller.configureCount);
router.post('/:id/update', controller.update);
router.post('/:id/toggle', controller.toggle);
router.post('/:id/delete', controller.remove);

module.exports = router;
