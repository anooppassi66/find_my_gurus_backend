const express = require('express');
const { requireAuth } = require('../middleware/auth');
const milestonesController = require('../controllers/milestonesController');

const router = express.Router();

router.patch('/:id', requireAuth, milestonesController.update);
router.post('/:id/reject', requireAuth, milestonesController.reject);
router.post('/:id/approve', requireAuth, milestonesController.approve);
router.post('/:id/submit', requireAuth, milestonesController.submit);
router.post('/:id/release', requireAuth, milestonesController.release);

module.exports = router;
