const express = require('express');
const { requireAuth } = require('../middleware/auth');
const contractsController = require('../controllers/contractsController');
const milestonesController = require('../controllers/milestonesController');

const router = express.Router();

router.get('/', requireAuth, contractsController.list);
router.get('/:id', requireAuth, contractsController.getOne);

router.post('/:id/milestones', requireAuth, milestonesController.create);
router.get('/:id/milestones', requireAuth, milestonesController.listForContract);

module.exports = router;
