const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errorHandler');
const { parseOrThrow } = require('../utils/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { filterChatMessage } = require('../utils/chatFilter');
const { serializeMessage } = require('../utils/chatSerializers');

function otherUserOf(conversation, userId) {
  return conversation.userAId === userId ? conversation.userB : conversation.userA;
}

const list = asyncHandler(async (req, res) => {
  const userId = Number(req.user.id);

  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ userAId: userId }, { userBId: userId }] },
    include: {
      userA: true,
      userB: true,
      messages: { orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json(
    conversations.map((c) => {
      const other = otherUserOf(c, userId);
      const last = c.messages[0];
      return {
        id: c.id,
        otherUser: { id: other.id, fullName: other.fullName, role: other.role },
        lastMessage: last ? last.body : null,
        lastMessageAt: last ? last.createdAt : null,
      };
    })
  );
});

const createSchema = z.object({
  otherUserId: z.coerce.number().int(),
});

const create = asyncHandler(async (req, res) => {
  const userId = Number(req.user.id);
  const data = parseOrThrow(createSchema, req.body);

  if (data.otherUserId === userId) {
    throw new ApiError(400, 'Cannot start a conversation with yourself');
  }

  const otherUser = await prisma.user.findUnique({ where: { id: data.otherUserId } });
  if (!otherUser) {
    throw new ApiError(404, 'User not found');
  }

  const [userAId, userBId] = [userId, data.otherUserId].sort((a, b) => a - b);

  const conversation = await prisma.conversation.upsert({
    where: { userAId_userBId: { userAId, userBId } },
    update: {},
    create: { userAId, userBId },
  });

  res.status(201).json({ id: conversation.id });
});

async function loadConversationForParticipant(id, userId) {
  const conversation = await prisma.conversation.findUnique({ where: { id } });
  if (!conversation) {
    throw new ApiError(404, 'Conversation not found');
  }
  if (conversation.userAId !== userId && conversation.userBId !== userId) {
    throw new ApiError(403, 'Not authorized for this conversation');
  }
  return conversation;
}

const messagesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});

// Page 1 is the most recent `pageSize` messages (page 2 the ones before
// that, and so on); items within a page are returned oldest-first so the
// client can render them top-to-bottom.
const listMessages = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);
  const query = parseOrThrow(messagesQuerySchema, req.query);

  await loadConversationForParticipant(id, userId);

  const [items, total] = await Promise.all([
    prisma.message.findMany({
      where: { conversationId: id },
      include: { meeting: true },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.message.count({ where: { conversationId: id } }),
  ]);

  res.json({
    items: items.reverse().map(serializeMessage),
    total,
    page: query.page,
    pageSize: query.pageSize,
  });
});

const sendMessageSchema = z.object({
  body: z.string().min(1),
});

const sendMessage = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);
  const data = parseOrThrow(sendMessageSchema, req.body);

  await loadConversationForParticipant(id, userId);

  const filteredBody = filterChatMessage(data.body);

  const message = await prisma.message.create({
    data: {
      conversationId: id,
      senderId: userId,
      body: filteredBody,
    },
  });

  res.status(201).json(serializeMessage(message));
});

module.exports = { list, create, listMessages, sendMessage };
