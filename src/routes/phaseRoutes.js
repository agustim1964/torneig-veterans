const express = require('express');
const controller = require('../controllers/phaseController');

const router = express.Router();

router.get('/category/:categoryId', controller.show);
router.post('/category/:categoryId/generate', controller.generate);

module.exports = router;
