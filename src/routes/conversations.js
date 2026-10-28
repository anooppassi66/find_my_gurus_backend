const express = require('express');
const { requireAuth } = require('../middleware/auth');
const conversationsController = require('../controllers/conversationsController');
const meetingsController = require('../controllers/meetingsController');

const router = express.Router();

router.get('/', requireAuth, conversationsController.list);
router.post('/', requireAuth, conversationsController.create);
router.get('/:id/messages', requireAuth, conversationsController.listMessages);
router.post('/:id/messages', requireAuth, conversationsController.sendMessage);
router.get('/:id/meetings', requireAuth, meetingsController.listForConversation);
router.post('/:id/meetings', requireAuth, meetingsController.createForConversation);

module.exports = router;
