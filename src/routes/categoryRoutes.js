const express = require('express');
const controller = require('../controllers/categoryController');

const router = express.Router();

router.get('/', controller.list);
router.post('/', controller.create);
router.post('/:id/format', controller.updateFormat);
router.post('/:id/table-mode', controller.updateTableMode);
router.get('/:id', controller.detail);

module.exports = router;
