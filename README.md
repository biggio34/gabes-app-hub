# Gabe's Apps

Private hub for three areas:

- **Financial** — advisory calculators
- **Softball** — MN Elks 16U practice, lineup, team formation, tryouts
- **Luna Haus Salon** — salon desk and booking

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

People, clubs, and teams live in a real database. Locally that is SQLite (`data/hub.db`). On the live site they go to the existing Supabase project (`cylppatfrlazaioptpzo`) in `hub_*` tables, so the old lineup tables stay untouched.

1. In the Supabase SQL editor, run `supabase/hub.sql`.
2. In Netlify, add `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API → `service_role`, secret). Optional: `SUPABASE_URL` if you use a different project.

Optional env:

- `HUB_ADMIN_PASSWORD` — owner password on first launch
- `HUB_SESSION_SECRET` — cookie signing secret
- `SUPABASE_URL` — defaults to the existing lineup project
- `SUPABASE_SERVICE_ROLE_KEY` — server-only secret; do not put this in the browser
- `GMAIL_USER` — Gmail address that sends invite emails
- `GMAIL_APP_PASSWORD` — 16-character Google app password (not your normal Gmail password)
- `HUB_PUBLIC_URL` — optional, defaults to the live Netlify site

**Account** is where you view your username and change your username or password. Saved passwords cannot be shown again; type a new one to change it.

**People** is where you add logins, tick Financial / Softball / Luna Haus, assign a club and team, and email them a link to the sign-in page. The email includes their username and the password you typed. You can also change anyone’s username or set a new password there.

Default softball org: **MN Elks** (club) and **16U Fransen** (team). You can add more clubs and teams on the People page. Those teams show in Team Roster, Lineup, Team Formation, Tryouts, and Practice Planner.

Salon **Supply Orders** lives under Luna Haus. Anyone with Luna Haus access can add and update requests. Only the owner can delete. Locally that is SQLite; on the live site run `supabase/salon-orders.sql` so `hub_salon_orders` and `hub_salon_order_items` exist, including `sku` and `vendor_order_number`.

Softball **Team Roster** is the one player list. Each girl has one People/player id that never resets. Opening her shows the card (strengths, development focus, coach-only notes, injury/availability, last parent conference) and season history — 2025 Fransen → 2026 Fransen is the same person. Primary and secondary position live on that player and stay when the year rolls; they are editable on her card. Jersey number lives on the season chapter, not the permanent id: she can be #10 in 2025 and #4 in 2026. This year’s number is on the current roster; past numbers stay in history. Tryout **Publish** (owner only) writes Offers onto that same id and sets this season’s number. Offer/Waitlist/Pass stay on the tryout as the paper trail. Tryouts, Team Formation, Lineup, and Practice Planner all read and write that same list — Lineup no longer keeps a second roster. Manual adds and CSV imports save to the hub database (`players` locally, `hub_players` on Supabase) plus the softball state blob. Re-run `supabase/hub.sql` so `hub_players` exists. After that, also run `supabase/softball-state.sql` if you have not already.

Softball data lives in that club blob in the database, not in the browser: roster, tryout scores, team assignments, practice plans, drills, templates, and game lineups. Each device loads from `/api/softball/state` and saves back there. Opening an app does not overwrite the cloud. Records merge by id so one phone cannot drop another device’s plans or games. Leftover `localStorage` copies are migrated once, then removed. The team picker and Team Formation’s list/grid layout stay in the browser as view preferences only.

On Netlify, add `GMAIL_USER` and `GMAIL_APP_PASSWORD`, then deploy again. Create the app password at [Google App Passwords](https://myaccount.google.com/apppasswords) after 2-Step Verification is on. Do not put that password in this repo.

## Split

Keep one website, three **areas**. Do not make three products yet. Later, Softball can become the thing you sell; Financial and Luna Haus stay your private doors.
