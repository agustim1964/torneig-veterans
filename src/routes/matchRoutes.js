const express = require('express');
const controller = require('../controllers/matchController');

const router = express.Router();

router.get('/category/:categoryId', controller.listByCategory);
router.post('/category/:categoryId/generate-groups', controller.generateGroups);
router.post('/:id/result', controller.saveResult);

module.exports = router;
