const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const requirementsController = require('../controllers/requirementsController');
const proposalsController = require('../controllers/proposalsController');

const router = express.Router();

router.post('/', requireAuth, requireRole('STUDENT'), requirementsController.create);
router.get('/mine', requireAuth, requireRole('STUDENT'), requirementsController.mine);
router.get('/open', requirementsController.open);
router.get('/:id', requireAuth, requirementsController.getOne);
router.patch('/:id', requireAuth, requireRole('STUDENT'), requirementsController.update);

router.post(
  '/:id/proposals',
  requireAuth,
  requireRole('GURU'),
  proposalsController.create
);
router.get(
  '/:id/proposals',
  requireAuth,
  requireRole('STUDENT'),
  proposalsController.listForRequirement
);

module.exports = router;
