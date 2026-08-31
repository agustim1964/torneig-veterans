const express = require('express');
const multer = require('multer');
const controller = require('../controllers/participantController');

const router = express.Router();
const upload = multer({ dest: 'uploads/' });

router.get('/category/:categoryId', controller.listByCategory);
router.post('/category/:categoryId', controller.create);
router.post('/category/:categoryId/import', upload.single('fitxer'), controller.importFile);
router.post('/:id/update', controller.update);
router.post('/:id/toggle', controller.toggleActive);

module.exports = router;
