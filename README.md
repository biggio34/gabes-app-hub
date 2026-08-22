# Gabe's Apps

Private hub for three areas:

- **Financial** — advisory calculators
- **Softball** — MN Elks 16U practice, lineup, team formation, tryouts
- **Luna Haus Salon** — salon desk, social sync, booking

One login. Each person only sees the areas Gabe turns on. Apps stay as they were on [gabes-app-hub.netlify.app](https://gabes-app-hub.netlify.app/); this version sits in front of them with a password.

The old Netlify site is still public until you take it down or point the domain here.

## Run locally

```bash
npm install
npm run dev
```

Open [http://127.0.0.1:43147](http://127.0.0.1:43147).

First login (change this after you add other people):

- Username: `gabe`
- Password: `FransenHub2026`

Optional env:

- `HUB_ADMIN_PASSWORD` — owner password on first launch
- `HUB_SESSION_SECRET` — cookie signing secret
- `GMAIL_USER` — Gmail address that sends invite emails
- `GMAIL_APP_PASSWORD` — 16-character Google app password (not your normal Gmail password)
- `HUB_PUBLIC_URL` — optional, defaults to the live Netlify site

**People** is where you add logins, tick Financial / Softball / Luna Haus, assign a club and team, and email them a link to the sign-in page. The email includes their username and the password you typed.

Default softball org: **MN Elks** (club) and **16U Fransen** (team). You can add more clubs and teams on the People page.

On Netlify, add `GMAIL_USER` and `GMAIL_APP_PASSWORD`, then deploy again. Create the app password at [Google App Passwords](https://myaccount.google.com/apppasswords) after 2-Step Verification is on. Do not put that password in this repo.

## Split

Keep one website, three **areas**. Do not make three products yet. Later, Softball can become the thing you sell; Financial and Luna Haus stay your private doors.
