const express = require('express');
const { requireAuth } = require('../middleware/auth');
const meetingsController = require('../controllers/meetingsController');

const router = express.Router();

router.get('/', requireAuth, meetingsController.listMine);
router.post('/:id/cancel', requireAuth, meetingsController.cancel);

module.exports = router;
