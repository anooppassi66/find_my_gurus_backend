// Creates and cancels Google Meet meetings.
//
// Google Meet links for *scheduled* meetings are created through the Google
// Calendar API: we create a calendar event with a `conferenceData.createRequest`
// of type `hangoutsMeet`, and Google attaches a Meet link to it. Every event is
// owned by the platform's own Google account (authorised once via
// `npm run google:auth`), so students and gurus never need to connect Google.
// Both participants are added as guests so they can join without being
// admitted, but guests can't see each other's addresses — the platform rule is
// that personal contact details are never exchanged.

const crypto = require('crypto');
const { calendar: googleCalendar, auth: googleAuth } = require('@googleapis/calendar');
const { ApiError } = require('../middleware/errorHandler');

function isMockMode() {
  return process.env.GOOGLE_MEET_MOCK === 'true';
}

function isConfigured() {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN
  );
}

let calendarClient = null;
function getCalendar() {
  if (!calendarClient) {
    const oauth2 = new googleAuth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    oauth2.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
    calendarClient = googleCalendar({ version: 'v3', auth: oauth2 });
  }
  return calendarClient;
}

const calendarId = () => process.env.GOOGLE_CALENDAR_ID || 'primary';
// "none" by default: the platform sends its own branded email, so Google's
// invite email would be a duplicate. Set to "all" to also get Google's invite.
const sendUpdates = () => process.env.GOOGLE_CALENDAR_SEND_UPDATES || 'none';

function buildEventBody({ title, description, startTime, endTime, timeZone, attendeeEmails }) {
  return {
    summary: title,
    description: description || undefined,
    start: { dateTime: startTime.toISOString(), timeZone },
    end: { dateTime: endTime.toISOString(), timeZone },
    attendees: attendeeEmails.map((email) => ({ email })),
    guestsCanSeeOtherGuests: false,
    guestsCanInviteOthers: false,
    guestsCanModify: false,
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };
}

function meetUrlFromEvent(event) {
  if (event.hangoutLink) return event.hangoutLink;
  const video = event.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video');
  return video?.uri || null;
}

function mockMeetCode() {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const pick = (n) => Array.from({ length: n }, () => letters[crypto.randomInt(letters.length)]).join('');
  return `${pick(3)}-${pick(4)}-${pick(3)}`;
}

function googleError(err, action) {
  const status = err?.response?.status || err?.code;
  const reason = err?.response?.data?.error?.message || err?.message || 'unknown error';
  console.error(`[googleMeet] ${action} failed (${status}): ${reason}`);
  if (status === 401 || /invalid_(grant|client)/.test(reason)) {
    return new ApiError(
      502,
      "Google rejected the server's Meet credentials (expired or invalid). An administrator needs to check GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET and re-run `npm run google:auth`."
    );
  }
  return new ApiError(502, `Couldn't ${action} with Google Meet. Please try again in a moment.`);
}

/**
 * Creates a calendar event with an attached Google Meet link.
 * Returns { meetUrl, eventId, calendarUrl }.
 */
async function createMeeting({ title, description, startTime, endTime, timeZone, attendeeEmails }) {
  if (isMockMode()) {
    return {
      meetUrl: `https://meet.google.com/${mockMeetCode()}`,
      eventId: `mock-${crypto.randomUUID()}`,
      calendarUrl: null,
    };
  }
  if (!isConfigured()) {
    throw new ApiError(
      503,
      'Google Meet is not configured on this server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN (see backend/README.md).'
    );
  }

  const calendar = getCalendar();
  let event;
  try {
    const res = await calendar.events.insert({
      calendarId: calendarId(),
      conferenceDataVersion: 1,
      sendUpdates: sendUpdates(),
      requestBody: buildEventBody({ title, description, startTime, endTime, timeZone, attendeeEmails }),
    });
    event = res.data;
  } catch (err) {
    throw googleError(err, 'create the meeting');
  }

  // Meet links are usually attached synchronously, but Google can report the
  // conference request as "pending" — poll briefly until the link appears.
  for (let attempt = 0; !meetUrlFromEvent(event) && attempt < 5; attempt += 1) {
    await new Promise((r) => setTimeout(r, 600));
    try {
      event = (await calendar.events.get({ calendarId: calendarId(), eventId: event.id })).data;
    } catch (err) {
      throw googleError(err, 'fetch the meeting link');
    }
  }

  const meetUrl = meetUrlFromEvent(event);
  if (!meetUrl) {
    await cancelMeeting(event.id).catch(() => {});
    throw new ApiError(502, "Google didn't return a Meet link for this meeting. Please try again.");
  }

  return { meetUrl, eventId: event.id, calendarUrl: event.htmlLink || null };
}

async function cancelMeeting(eventId) {
  if (!eventId || eventId.startsWith('mock-')) return;
  if (!isConfigured()) {
    throw new ApiError(503, 'Google Meet is not configured on this server.');
  }
  try {
    await getCalendar().events.delete({ calendarId: calendarId(), eventId, sendUpdates: sendUpdates() });
  } catch (err) {
    const status = err?.response?.status || err?.code;
    if (status === 404 || status === 410) return; // already gone on Google's side
    throw googleError(err, 'cancel the meeting');
  }
}

module.exports = { createMeeting, cancelMeeting, buildEventBody, isMockMode, isConfigured };
