const express = require('express');
const controller = require('../controllers/groupController');
const adjustment = require('../controllers/groupAdjustmentController');

const router = express.Router();
const handle = action => (req,res,next) => action(req,res).catch(error => {
  if (error.code) return next(error);
  res.status(409).render('groups/adjust-error', { message:error.message, groupId:Number(req.params.id) });
});
router.get('/:id/adjust', handle(adjustment.show));
router.post('/:id/adjust/preview', handle(adjustment.preview));
router.post('/:id/adjust/add', handle(adjustment.add));
router.post('/:id/adjust/schedule', handle(adjustment.schedule));

router.get('/category/:categoryId', controller.showByCategory);
router.get('/category/:categoryId/print', controller.printCategoryGroups);
router.get('/:id/print', controller.printGroup);
router.post('/category/:categoryId/draw', controller.draw);
router.post('/move', controller.moveParticipant);

module.exports = router;
