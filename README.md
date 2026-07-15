# Southwest Price Drop Tracker

Tracks the points price for already-booked Southwest one-way flights and
emails an alert when the cheapest available fare bucket drops below what was
paid. Runs once a day via cron on a Raspberry Pi — no cloud dependency.

See [PLAN.md](./PLAN.md) for the full design, including why points (not cash)
are tracked and anti-detection notes.

## Setup

```
npm install
npx playwright install chromium
cp config/flights.example.json config/flights.json   # fill in your real flights
```

Gmail auth: place a pre-authorized `token.json` in the project root (not
committed). It must be a Python google-auth style credentials dump — a single
JSON file with `token`, `refresh_token`, `client_id`, `client_secret`, and
`token_uri` — authorized with at least the `gmail.send` scope. No separate
`credentials.json` is needed.

Southwest session: run `npm run login` once to open a headed browser, log in
manually, and save the session to `storage-state.json` (not committed).

## Run

```
NOTIFY_EMAIL=you@example.com npm start
```

Intended to be invoked once daily from system cron at a randomized time
within a window (e.g. 09:00–13:00 local).

## Status

Scraper and Gmail auth have both been verified against the live site/API.
Not yet run as a full end-to-end cron job on the Pi.
