const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const gurusController = require('../controllers/gurusController');

const router = express.Router();

router.get('/', gurusController.list);
// Must be registered before /:userId so "me" isn't parsed as a userId.
router.put('/me', requireAuth, requireRole('GURU'), gurusController.updateMe);
router.get('/:userId', gurusController.getOne);

module.exports = router;
