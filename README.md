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

People and passwords are stored in `data/users.json` (not committed). **People** in the hub is where you add logins and tick Financial / Softball / Luna Haus.

## Split

Keep one website, three **areas**. Do not make three products yet. Later, Softball can become the thing you sell; Financial and Luna Haus stay your private doors.
