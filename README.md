# Southwest Price Drop Tracker

Tracks the points price for already-booked Southwest one-way flights and
emails an alert when the cheapest available fare bucket drops below what was
paid. Runs once a day via cron on a Raspberry Pi — no cloud dependency.

See [PLAN.md](./PLAN.md) for the full design, including why points (not cash)
are tracked, anti-detection notes, and open questions still needing live
verification against southwest.com.

## Setup

```
npm install
npx playwright install chromium
cp config/flights.example.json config/flights.json   # fill in your real flights
```

Gmail auth: place OAuth `credentials.json` and a pre-authorized `token.json`
in the project root (not committed).

Southwest session: run `npm run login` once to open a headed browser, log in
manually, and save the session to `storage-state.json` (not committed).

## Run

```
NOTIFY_EMAIL=you@example.com npm start
```

Intended to be invoked once daily from system cron at a randomized time
within a window (e.g. 09:00–13:00 local).

## Status

Early scaffold. The scraper's DOM selectors and deep-link URL params are
placeholders pending live inspection of southwest.com's search results page
— see the "Open questions" section in PLAN.md.
