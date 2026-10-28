# Find My Gurus — Backend

Node.js/Express API for the Find My Gurus tutoring marketplace, backed by MySQL via Prisma.

The single source of truth for endpoints and business logic is `../API_CONTRACT.md`. The database schema is `prisma/schema.prisma`.

## Setup

```bash
cp .env.example .env
# then edit .env and fill in a real DATABASE_URL (mysql://user:pass@host:port/db),
# a JWT_SECRET, and CORS_ORIGIN for your frontend's origin

npm install

npx prisma migrate dev --name init   # creates the MySQL schema
npm run seed                          # seeds categories, commission bands, demo users

npm run dev                           # starts the API with nodemon on $PORT (default 4000)
```

The API is mounted under `/api` (e.g. `http://localhost:4000/api/gurus`), except `GET /health` which is unprefixed and requires no auth.

## Project layout

```
src/
  index.js              Express app entry (CORS, JSON body parsing, routes, error handler)
  lib/prisma.js          singleton PrismaClient
  middleware/auth.js      requireAuth, requireRole
  middleware/errorHandler.js  ApiError + JSON error formatting
  utils/commission.js     resolves a CommissionBand for an amount
  utils/chatFilter.js     redacts phone/email/skype/zoom/whatsapp from chat messages
  utils/validate.js       zod parse-or-throw-400 helper
  utils/format.js         Decimal -> money string helper
  utils/asyncHandler.js    wraps async controllers for Express error propagation
  routes/                 thin route -> controller wiring, one file per resource
  controllers/             request validation + Prisma calls, one file per resource
prisma/
  schema.prisma
  seed.js
```

## Demo login credentials

Seeded by `npm run seed` (password is the same for all three accounts):

| Role    | Email             | Password      |
|---------|-------------------|---------------|
| Student | student@demo.com  | password123   |
| Guru    | guru1@demo.com    | password123   |
| Guru    | guru2@demo.com    | password123   |

## Notes / verification done in this environment

- `npx prisma validate` and `npx prisma generate` both pass against `prisma/schema.prisma`.
- Every file under `src/` and `prisma/` passes `node --check`.
- `require('./src/index.js')` loads cleanly with no syntax/wiring errors (the `app.listen` call is guarded behind `require.main === module` so requiring the module doesn't start a server or hang).
- Running migrations/seed against a real MySQL database was not done here — that requires the DB credentials you set up locally.

## Google Meet appointments

Students and gurus schedule meetings from the chat (video-camera button in the chat header). Each meeting gets a Google Meet link created automatically, a card is posted in the chat, and both participants are emailed. Either participant can cancel; the other is notified the same way.

**How it works:** the backend creates an event in the platform's Google Calendar with a Meet conference attached (Google Calendar API, `conferenceData`). Both participants are added as guests so they can join without being admitted, but guests can't see each other's addresses. Students and gurus never need to connect a Google account.

### Local development (no Google account needed)

`GOOGLE_MEET_MOCK="true"` in `.env` gives meetings placeholder Meet links, and with `SMTP_HOST` empty, emails are printed to the API console. Everything else (chat cards, cancellation, validation) works normally.

### Google Meet setup (real meetings)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and **enable the Google Calendar API**.
2. **OAuth consent screen:** choose *External* (or *Internal* for Google Workspace), fill in the app name, and add the scope `.../auth/calendar.events`. **Publish the app ("In production")** — refresh tokens for apps left in *Testing* expire after 7 days. Google may show an "unverified app" warning during the one-time sign-in in step 5; that's fine for authorising your own account.
3. **Credentials → Create OAuth client ID → Web application.** Add `http://localhost:4567/oauth2callback` (or your `GOOGLE_REDIRECT_URI`) as an authorised redirect URI.
4. Put the client ID and secret in `.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`).
5. Run `npm run google:auth`, open the printed URL, and sign in with the **platform's Google account** (the account that will own all meetings — e.g. a dedicated `meetings@yourdomain` account). Copy the printed `GOOGLE_REFRESH_TOKEN` into `.env`.
6. Set `GOOGLE_MEET_MOCK="false"` and restart the API. The startup log warns if anything is still missing.

Notes:
- A Google Workspace account is recommended for production (higher limits; free Gmail accounts work too — 1:1 meetings can run up to 24 hours).
- `GOOGLE_CALENDAR_SEND_UPDATES="none"` (default) means only the platform's branded email is sent. Set it to `"all"` to also have Google send its own calendar invite.
- Participants appear in the Meet call under their Google account name once they join.

### Email (SMTP)

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `EMAIL_FROM` for any SMTP provider (Google Workspace, SendGrid, SES, Mailgun, Postmark…). `APP_URL` must be the frontend's public URL so the "Open conversation" link in emails works.
