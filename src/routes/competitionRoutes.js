const express = require('express');
const controller = require('../controllers/competitionController');

const router = express.Router();
router.get('/', controller.list);
router.get('/:id/participants', controller.participantList);
router.get('/:id/groups', (req, res, next) => {
  controller.groupList(req, res).catch(next);
});
router.post('/', controller.create);
router.post('/:id/config', controller.updateConfig);
router.post('/:id/toggle', controller.toggle);

module.exports = router;
