function serializeMeeting(meeting) {
  if (!meeting) return null;
  const cancelled = meeting.status === 'CANCELLED';
  return {
    id: meeting.id,
    conversationId: meeting.conversationId,
    createdById: meeting.createdById,
    title: meeting.title,
    description: meeting.description,
    startTime: meeting.startTime,
    endTime: meeting.endTime,
    durationMinutes: Math.round((meeting.endTime - meeting.startTime) / 60000),
    timeZone: meeting.timeZone,
    status: meeting.status,
    // A cancelled meeting's link must not be offered for joining any more.
    meetUrl: cancelled ? null : meeting.meetUrl,
    calendarUrl: cancelled ? null : meeting.calendarUrl,
    cancelledById: meeting.cancelledById,
    cancelledAt: meeting.cancelledAt,
    createdAt: meeting.createdAt,
  };
}

function serializeMessage(message) {
  return {
    id: message.id,
    conversationId: message.conversationId,
    senderId: message.senderId,
    type: message.type,
    body: message.body,
    meeting: serializeMeeting(message.meeting),
    createdAt: message.createdAt,
  };
}

module.exports = { serializeMeeting, serializeMessage };
