// Outgoing email. Uses SMTP when SMTP_HOST is set (works with any provider —
// Gmail/Google Workspace, SendGrid, SES, Mailgun, Postmark...). Without SMTP
// configured, emails are printed to the console so local development works.

const nodemailer = require('nodemailer');

let transporter = null;
function getTransporter() {
  if (!transporter && process.env.SMTP_HOST) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, html, text }) {
  const from = process.env.EMAIL_FROM || 'Find My Gurus <no-reply@findmygurus.local>';
  const smtp = getTransporter();
  if (!smtp) {
    console.log(`\n[email] SMTP not configured — would send:\n  From: ${from}\n  To: ${to}\n  Subject: ${subject}\n${text}\n`);
    return;
  }
  await smtp.sendMail({ from, to, subject, html, text });
}

module.exports = { sendEmail };
