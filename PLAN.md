# Southwest Price Drop Tracker — PLAN.md

## Goal
Track price (in miles) for already-booked Southwest one-way flights and email an
alert when the cheapest available fare bucket drops below what was paid.
Runs once daily on a Raspberry Pi (cron), no cloud dependency, no paid service.

## Why miles
Southwest lets you cancel *any* fare (including Wanna Get Away) booked with points
for a full refund to your Rapid Rewards account. Cash Wanna Get Away fares are
travel-fund-only on cancel. So we track **the cheapest points price** for the
exact flight, not cash price — that's the number that determines whether
cancel-and-rebook is worth it.

## Scope
- ~4–6 tracked one-way flights at a time, config-driven
- Check once per day, at a randomized time in a window (e.g. 09:00–13:00 local)
- Email-only alerting (no push/Home Assistant integration for v1)
- Personal use, single Pi, no multi-user

## Tech stack
- Node.js + Playwright (`playwright-extra` + `puppeteer-extra-plugin-stealth`)
- Persistent browser storage state (cookies) saved to disk between runs
- `node-cron` or system cron + a plain script (system cron preferred — simpler,
  survives reboots without a running process)
- Send mail using the gmail API. token.json will be provided from another project.
- Local SQLite for tracked-flights config + price history (SQLite
  so we can make a history chart later)

## Config format (flights.json)
```json
[
  {
    "id": "atl-den-0815",
    "origin": "ATL",
    "destination": "DEN",
    "date": "2026-08-15",
    "points_paid": 12500,
    "confirmation_number": "ABC123",
    "notify_threshold_points": 500
  }
]
```
- `notify_threshold_points`: minimum points drop to bother alerting on (avoid
  noise from trivial fluctuations)

## Scraper logic
1. Launch stealth-patched Chromium, load persisted cookie/session state if present
2. Navigate to Southwest one-way search for origin/destination/date, points fare toggle
3. Parse all fare buckets returned (Wanna Get Away, WGA+, Anytime, Business Select)
   and take the lowest points price shown — this is "cheapest available," not
   necessarily the same bucket originally booked, since any bucket is
   points-refundable
4. Save result + timestamp to price history store
5. Compare to `points_paid`; if drop >= `notify_threshold_points`, queue an email
6. Save updated cookie/session state back to disk
7. Random delay (1–4s) between page actions; randomize viewport slightly per run

## Anti-detection notes (from earlier discussion)
- Stealth plugin handles fingerprint-level signals (navigator.webdriver, etc.) —
  higher priority than behavioral randomization
- Persist cookies across runs rather than fresh session each time
- Randomize daily run time within a window, not a fixed cron minute
- Keep total requests low: 4–6 route checks, once/day — light footprint
- No guarantee against future detection changes; fallback is manual checking

## Email alert format
Plain text, one email per run (batched, not per-flight) if any flights dropped:
```
Subject: Southwest price drop: 2,700 pts

ATL -> DEN (Aug 15, conf ABC123)
  Paid: 12,500 pts | Now: 9,800 pts | Save: 2,700 pts
  Rebook: [southwest.com link if easily constructible]

...
```

## Out of scope for v1 (future ideas)
- Home Assistant notification integration
- Price history charting / dashboard
- Multi-user support
- Automatic rebooking (manual click-through only, by design — avoid
  accidentally rebooking into a worse seat/fare like the Junova complaint)

## Open questions for Claude Code to flag if unclear
- Exact DOM structure of Southwest's points fare search results (will need
  live inspection — selectors will likely need iteration)
- Whether Southwest's search URL can be deep-linked with query params to skip
  UI interaction (worth checking before committing to full page-object clicks)
