const express = require('express');
const controller = require('../controllers/matchController');

const router = express.Router();

router.get('/category/:categoryId', controller.listByCategory);
router.post('/category/:categoryId/generate-groups', controller.generateGroups);
router.post('/group/:groupId/regenerate', controller.regenerateGroup);
router.post('/group/:groupId/delete', controller.deleteGroupMatches);
router.post('/:id/result', controller.saveResult);

module.exports = router;
