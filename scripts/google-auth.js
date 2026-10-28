// One-time setup: authorise the platform's Google account so the backend can
// create Google Meet meetings on its behalf.
//
//   1. Put GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
//   2. npm run google:auth
//   3. Open the printed URL, sign in with the platform Google account, allow access
//   4. Copy the printed GOOGLE_REFRESH_TOKEN into .env and restart the API
//
// The OAuth client must list GOOGLE_REDIRECT_URI (default below) as an
// authorised redirect URI in Google Cloud Console.

require('dotenv').config();
const http = require('http');
const { auth } = require('@googleapis/calendar');

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:4567/oauth2callback';

if (!clientId || !clientSecret) {
  console.error('Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env first.');
  process.exit(1);
}

const oauth2 = new auth.OAuth2(clientId, clientSecret, redirectUri);
const url = oauth2.generateAuthUrl({
  access_type: 'offline',
  prompt: 'consent', // always return a refresh token, even on re-authorisation
  scope: ['https://www.googleapis.com/auth/calendar.events'],
});

const { port, pathname } = new URL(redirectUri);

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, redirectUri);
  if (reqUrl.pathname !== pathname) {
    res.writeHead(404).end();
    return;
  }
  const code = reqUrl.searchParams.get('code');
  if (!code) {
    res.writeHead(400).end(`Authorisation failed: ${reqUrl.searchParams.get('error') || 'no code returned'}`);
    return;
  }
  try {
    const { tokens } = await oauth2.getToken(code);
    res.writeHead(200, { 'Content-Type': 'text/plain' }).end('Authorised. You can close this tab and return to the terminal.');
    if (!tokens.refresh_token) {
      console.error('\nGoogle did not return a refresh token. Remove the app at https://myaccount.google.com/permissions and run this again.');
    } else {
      console.log('\nSuccess. Add this line to backend/.env, then restart the API:\n');
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    }
  } catch (err) {
    res.writeHead(500).end('Token exchange failed — see the terminal.');
    console.error('\nToken exchange failed:', err.response?.data || err.message);
  } finally {
    server.close();
  }
});

server.listen(Number(port) || 80, () => {
  console.log('Open this URL in your browser and sign in with the platform Google account:\n');
  console.log(url);
  console.log(`\nWaiting for Google to redirect back to ${redirectUri} ...`);
});
