const { z } = require('zod');
const prisma = require('../lib/prisma');
const { ApiError } = require('../middleware/errorHandler');
const { parseOrThrow } = require('../utils/validate');
const { asyncHandler } = require('../utils/asyncHandler');
const { filterChatMessage } = require('../utils/chatFilter');
const { serializeMeeting, serializeMessage } = require('../utils/chatSerializers');
const googleMeet = require('../services/googleMeet');
const { notifyMeetingScheduled, notifyMeetingCancelled } = require('../services/meetingNotifications');

const MAX_DAYS_AHEAD = 365;

async function loadConversation(id, userId) {
  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: { userA: true, userB: true },
  });
  if (!conversation) throw new ApiError(404, 'Conversation not found');
  if (conversation.userAId !== userId && conversation.userBId !== userId) {
    throw new ApiError(403, 'Not authorized for this conversation');
  }
  const me = conversation.userAId === userId ? conversation.userA : conversation.userB;
  const other = conversation.userAId === userId ? conversation.userB : conversation.userA;
  return { conversation, me, other };
}

function validTimeZone(tz) {
  if (!tz) return 'UTC';
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

const createSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: z.string().trim().max(1000).optional(),
  startTime: z.string().datetime({ offset: true, message: 'startTime must be an ISO 8601 date-time' }),
  durationMinutes: z.coerce.number().int().min(15, 'Minimum duration is 15 minutes').max(240, 'Maximum duration is 4 hours'),
  timeZone: z.string().max(64).optional(),
});

const createForConversation = asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id);
  const userId = Number(req.user.id);
  const data = parseOrThrow(createSchema, req.body);
  const { me, other } = await loadConversation(conversationId, userId);

  const startTime = new Date(data.startTime);
  const endTime = new Date(startTime.getTime() + data.durationMinutes * 60000);
  if (startTime.getTime() < Date.now() - 60000) {
    throw new ApiError(400, 'Pick a start time in the future');
  }
  if (startTime.getTime() > Date.now() + MAX_DAYS_AHEAD * 86400000) {
    throw new ApiError(400, 'Meetings can be scheduled up to a year ahead');
  }

  const clash = await prisma.meeting.findFirst({
    where: {
      conversationId,
      status: 'SCHEDULED',
      startTime: { lt: endTime },
      endTime: { gt: startTime },
    },
  });
  if (clash) {
    throw new ApiError(409, `This overlaps with "${clash.title}" already scheduled in this conversation`);
  }

  // Title and notes are copied into the other person's email and calendar,
  // so apply the same personal-contact-info filter as chat messages.
  const title = filterChatMessage(data.title.replace(/\s+/g, ' ')); // single line: it becomes an email subject
  const description = data.description ? filterChatMessage(data.description) : null;
  const timeZone = validTimeZone(data.timeZone);

  const google = await googleMeet.createMeeting({
    title,
    description: [description, 'Scheduled on Find My Gurus.'].filter(Boolean).join('\n\n'),
    startTime,
    endTime,
    timeZone,
    attendeeEmails: [me.email, other.email],
  });

  let meeting;
  let message;
  try {
    [meeting, message] = await prisma.$transaction(async (tx) => {
      const created = await tx.meeting.create({
        data: {
          conversationId,
          createdById: userId,
          title,
          description,
          startTime,
          endTime,
          timeZone,
          meetUrl: google.meetUrl,
          googleEventId: google.eventId,
          calendarUrl: google.calendarUrl,
        },
      });
      const card = await tx.message.create({
        data: {
          conversationId,
          senderId: userId,
          type: 'MEETING_SCHEDULED',
          body: `Scheduled a Google Meet: ${title}`,
          meetingId: created.id,
        },
        include: { meeting: true },
      });
      return [created, card];
    });
  } catch (err) {
    await googleMeet.cancelMeeting(google.eventId).catch(() => {});
    throw err;
  }

  notifyMeetingScheduled({ meeting, creator: me, invitee: other }).catch((err) =>
    console.error('[meetings] scheduled notification failed:', err)
  );

  res.status(201).json({ meeting: serializeMeeting(meeting), message: serializeMessage(message) });
});

const listQuerySchema = z.object({
  scope: z.enum(['upcoming', 'all']).default('upcoming'),
});

const listForConversation = asyncHandler(async (req, res) => {
  const conversationId = Number(req.params.id);
  const userId = Number(req.user.id);
  const query = parseOrThrow(listQuerySchema, req.query);
  await loadConversation(conversationId, userId);

  const meetings = await prisma.meeting.findMany({
    where: {
      conversationId,
      ...(query.scope === 'upcoming' ? { status: 'SCHEDULED', endTime: { gte: new Date() } } : {}),
    },
    orderBy: { startTime: 'asc' },
  });
  res.json(meetings.map(serializeMeeting));
});

const listMine = asyncHandler(async (req, res) => {
  const userId = Number(req.user.id);
  const query = parseOrThrow(listQuerySchema, req.query);

  const meetings = await prisma.meeting.findMany({
    where: {
      conversation: { OR: [{ userAId: userId }, { userBId: userId }] },
      ...(query.scope === 'upcoming' ? { status: 'SCHEDULED', endTime: { gte: new Date() } } : {}),
    },
    include: { conversation: { include: { userA: true, userB: true } } },
    orderBy: { startTime: 'asc' },
  });

  res.json(
    meetings.map((m) => {
      const other = m.conversation.userAId === userId ? m.conversation.userB : m.conversation.userA;
      return { ...serializeMeeting(m), otherUser: { id: other.id, fullName: other.fullName, role: other.role } };
    })
  );
});

const cancel = asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const userId = Number(req.user.id);

  const existing = await prisma.meeting.findUnique({ where: { id } });
  if (!existing) throw new ApiError(404, 'Meeting not found');
  const { me, other } = await loadConversation(existing.conversationId, userId);

  if (existing.status === 'CANCELLED') throw new ApiError(409, 'This meeting is already cancelled');
  if (existing.endTime.getTime() < Date.now()) throw new ApiError(409, 'This meeting has already ended');

  await googleMeet.cancelMeeting(existing.googleEventId);

  const [meeting, message] = await prisma.$transaction(async (tx) => {
    const { count } = await tx.meeting.updateMany({
      where: { id, status: 'SCHEDULED' },
      data: { status: 'CANCELLED', cancelledById: userId, cancelledAt: new Date() },
    });
    if (count === 0) throw new ApiError(409, 'This meeting is already cancelled');
    const updated = await tx.meeting.findUniqueOrThrow({ where: { id } });
    const note = await tx.message.create({
      data: {
        conversationId: existing.conversationId,
        senderId: userId,
        type: 'MEETING_CANCELLED',
        body: `Cancelled the Google Meet: ${existing.title}`,
        meetingId: id,
      },
      include: { meeting: true },
    });
    return [updated, note];
  });

  notifyMeetingCancelled({ meeting, canceller: me, other }).catch((err) =>
    console.error('[meetings] cancellation notification failed:', err)
  );

  res.json({ meeting: serializeMeeting(meeting), message: serializeMessage(message) });
});

module.exports = { createForConversation, listForConversation, listMine, cancel };
