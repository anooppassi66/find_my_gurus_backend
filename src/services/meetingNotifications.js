// Email notifications for Google Meet appointments scheduled from chat.
// (The in-chat notification is the MEETING_* message created alongside the
// meeting in meetingsController.)

const { sendEmail } = require('./email');

const PRIMARY = '#F93800';
const SECONDARY = '#285969';
const TEXT = '#16313A';
const MUTED = '#5C7680';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appUrl(path) {
  return `${(process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '')}${path}`;
}

function formatWhen(meeting) {
  const tz = meeting.timeZone || 'UTC';
  const day = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(meeting.startTime);
  const time = (d, withZone) =>
    new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour: 'numeric',
      minute: '2-digit',
      ...(withZone ? { timeZoneName: 'short' } : {}),
    }).format(d);
  return `${day} · ${time(meeting.startTime, false)} – ${time(meeting.endTime, true)}`;
}

function durationLabel(meeting) {
  const minutes = Math.round((meeting.endTime - meeting.startTime) / 60000);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function layout({ heading, intro, meeting, primaryCta, secondaryCta, footnote }) {
  const rows = [
    ['When', formatWhen(meeting)],
    ['Duration', durationLabel(meeting)],
    ...(meeting.description ? [['Notes', meeting.description]] : []),
  ];
  const button = (cta, filled) =>
    `<a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:11px 20px;border-radius:6px;font-weight:600;font-size:14px;text-decoration:none;${
      filled
        ? `background:${PRIMARY};color:#ffffff;`
        : `background:#ffffff;color:${TEXT};border:1px solid #DCE3E5;`
    }">${escapeHtml(cta.label)}</a>`;

  return `<!doctype html><html><body style="margin:0;padding:0;background:#F7F9FA;font-family:'Open Sans','Helvetica Neue',Helvetica,Arial,sans-serif;color:${TEXT};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FA;padding:32px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #DCE3E5;border-radius:16px;overflow:hidden;">
<tr><td style="background:${SECONDARY};padding:20px 28px;color:#ffffff;font-size:18px;font-weight:800;">Find My <span style="color:${PRIMARY};">Gurus</span></td></tr>
<tr><td style="padding:28px;">
  <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${SECONDARY};margin-bottom:6px;">Google Meet</div>
  <h1 style="margin:0 0 10px;font-size:22px;line-height:1.3;color:${TEXT};">${escapeHtml(heading)}</h1>
  <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:${MUTED};">${intro}</p>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #DCE3E5;border-radius:10px;margin-bottom:22px;">
    <tr><td colspan="2" style="padding:14px 16px;border-bottom:1px solid #DCE3E5;font-weight:700;font-size:15px;">${escapeHtml(meeting.title)}</td></tr>
    ${rows
      .map(
        ([k, v]) =>
          `<tr><td style="padding:10px 16px;font-size:13px;color:${MUTED};width:90px;vertical-align:top;">${k}</td><td style="padding:10px 16px;font-size:13px;color:${TEXT};">${escapeHtml(v)}</td></tr>`
      )
      .join('')}
  </table>
  <div>${primaryCta ? button(primaryCta, true) : ''}${secondaryCta ? `&nbsp;&nbsp;${button(secondaryCta, false)}` : ''}</div>
  ${footnote ? `<p style="margin:22px 0 0;font-size:12px;line-height:1.6;color:#93A6AC;">${footnote}</p>` : ''}
</td></tr></table>
<p style="font-size:11px;color:#93A6AC;margin:16px 0 0;">You're receiving this because you have a conversation on Find My Gurus.</p>
</td></tr></table></body></html>`;
}

function plainText({ heading, introText, meeting, links }) {
  return [
    heading,
    '',
    introText,
    '',
    meeting.title,
    `When: ${formatWhen(meeting)}`,
    `Duration: ${durationLabel(meeting)}`,
    ...(meeting.description ? [`Notes: ${meeting.description}`] : []),
    '',
    ...links.map((l) => `${l.label}: ${l.href}`),
  ].join('\n');
}

function scheduledEmail({ meeting, recipient, otherParty, isCreator }) {
  const heading = isCreator ? 'Your meeting is scheduled' : `${otherParty.fullName} scheduled a meeting with you`;
  const introText = isCreator
    ? `Your Google Meet with ${otherParty.fullName} is booked. We've let them know by email and in your chat.`
    : `${otherParty.fullName} scheduled a Google Meet with you on Find My Gurus. Join with the link below at the scheduled time.`;
  const join = { label: 'Join Google Meet', href: meeting.meetUrl };
  const chat = { label: 'Open conversation', href: appUrl(`/messages/${meeting.conversationId}`) };
  return {
    to: recipient.email,
    subject: isCreator
      ? `Scheduled: ${meeting.title} with ${otherParty.fullName}`
      : `New meeting: ${meeting.title} with ${otherParty.fullName}`,
    html: layout({
      heading,
      intro: escapeHtml(introText),
      meeting,
      primaryCta: join,
      secondaryCta: chat,
      footnote:
        'Please keep all communication on Find My Gurus — sharing personal contact details (phone, email, other apps) isn\'t allowed.',
    }),
    text: plainText({ heading, introText, meeting, links: [join, chat] }),
  };
}

function cancelledEmail({ meeting, recipient, canceller }) {
  const heading = `${canceller.fullName} cancelled your meeting`;
  const introText = `This Google Meet has been cancelled and its link no longer applies. You can schedule a new time from your chat.`;
  const chat = { label: 'Open conversation', href: appUrl(`/messages/${meeting.conversationId}`) };
  return {
    to: recipient.email,
    subject: `Cancelled: ${meeting.title}`,
    html: layout({ heading, intro: escapeHtml(introText), meeting, primaryCta: chat }),
    text: plainText({ heading, introText, meeting, links: [chat] }),
  };
}

async function deliver(emails) {
  const results = await Promise.allSettled(emails.map(sendEmail));
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[meetingNotifications] email to ${emails[i].to} failed:`, r.reason?.message || r.reason);
    }
  });
}

function notifyMeetingScheduled({ meeting, creator, invitee }) {
  return deliver([
    scheduledEmail({ meeting, recipient: invitee, otherParty: creator, isCreator: false }),
    scheduledEmail({ meeting, recipient: creator, otherParty: invitee, isCreator: true }),
  ]);
}

function notifyMeetingCancelled({ meeting, canceller, other }) {
  return deliver([cancelledEmail({ meeting, recipient: other, canceller })]);
}

module.exports = { notifyMeetingScheduled, notifyMeetingCancelled, scheduledEmail, cancelledEmail, formatWhen };
