const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const walletController = require('../controllers/walletController');

const router = express.Router();

router.get('/me', requireAuth, walletController.me);
router.post('/topup', requireAuth, requireRole('STUDENT'), walletController.topup);
router.post('/withdraw', requireAuth, requireRole('GURU'), walletController.withdraw);

module.exports = router;
