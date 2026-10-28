const express = require('express');
const commissionController = require('../controllers/commissionController');

const router = express.Router();

router.get('/bands', commissionController.bands);
router.get('/calculate', commissionController.calculate);

module.exports = router;
