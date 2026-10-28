// Redacts obvious personal contact info from a chat message body before it's
// persisted. Not bulletproof by design (see API_CONTRACT.md) — just present.

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Matches common phone number formats: optional +country code, then groups of
// digits separated by spaces/dashes/dots/parens, at least 7 digits total.
const PHONE_RE = /(\+?\d[\d\s().-]{6,}\d)/g;

const KEYWORD_RE = /\b(skype|zoom|whatsapp)\b/gi;

function filterChatMessage(body) {
  if (typeof body !== 'string') return body;

  return body
    .replace(EMAIL_RE, '[hidden]')
    .replace(PHONE_RE, '[hidden]')
    .replace(KEYWORD_RE, '[hidden]');
}

module.exports = { filterChatMessage };
