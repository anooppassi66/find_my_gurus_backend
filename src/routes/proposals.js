const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const proposalsController = require('../controllers/proposalsController');

const router = express.Router();

router.get('/mine', requireAuth, requireRole('GURU'), proposalsController.mine);
router.patch('/:id', requireAuth, requireRole('STUDENT'), proposalsController.update);

module.exports = router;
