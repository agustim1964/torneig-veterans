const express = require('express');
const multer = require('multer');
const controller = require('../controllers/participantController');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.get('/category/:categoryId', controller.listByCategory);
router.get('/category/:categoryId/new', controller.newForm);
router.post('/category/:categoryId', controller.create);
router.post('/category/:categoryId/import', upload.single('fitxer'), (req, res, next) => {
  controller.importFile(req, res).catch(next);
});
router.get('/:id/edit', controller.edit);
router.post('/:id/update', controller.update);
router.post('/:id/category', (req, res, next) => {
  controller.changeCategory(req, res).catch(next);
});
router.post('/:id/toggle', controller.toggleActive);

module.exports = router;
