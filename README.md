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

Intended to be invoked periodically (e.g. once or twice a day).

## Run with Docker

The `Dockerfile` uses Microsoft's official Playwright image so the bundled
Chromium always matches the pinned `playwright` version — this matters on
arm64 hosts (e.g. a Raspberry Pi), where Playwright's own browser download
can otherwise mismatch the architecture. It's a multi-stage build: a
`builder` stage compiles `better-sqlite3`'s native module (needs
python3/make/g++), and only the finished `node_modules` gets copied into the
clean runtime stage — see the comment in the Dockerfile for why the build
tools can't just be removed from a single-stage image afterwards.

Build:

```
docker build -t southwest-price-notifier .
```

`config/`, `data/` (the sqlite price-history db), `storage-state.json`,
`token.json`, and `src/` all need to persist or be editable across container
runs/restarts, so mount them from the host rather than baking them into the
image:

```
docker run -d --restart unless-stopped \
  -v /path/to/repo/config:/app/config \
  -v /path/to/repo/data:/app/data \
  -v /path/to/repo/storage-state.json:/app/storage-state.json \
  -v /path/to/repo/token.json:/app/token.json \
  -v /path/to/repo/src:/app/src \
  -e NOTIFY_EMAIL=you@example.com \
  --name southwest-price-notifier-loop \
  --entrypoint /bin/sh \
  southwest-price-notifier \
  -c 'while true; do node src/index.js; sleep 43200; done'
```

(`sleep 43200` = 12 hours; adjust to taste. `src/` is bind-mounted rather than
baked into the image so scraper fixes don't need a rebuild — see "Updating"
below. `node_modules` is still baked in, since it contains `better-sqlite3`'s
architecture-specific compiled native module; only rebuild that when
`package.json` changes.)

### Updating

`src/` is bind-mounted, so editing a file (e.g. a scraper selector fix after
Southwest tweaks their site) or editing `config/flights.json` takes effect on
its own — the container's loop shells out to a fresh `node src/index.js`
every 12h, which re-reads both from disk. No rebuild or restart needed; the
next loop iteration just picks it up. Restart the container if you want the
change to take effect immediately instead of waiting for the next cycle:

```
docker restart southwest-price-notifier-loop
```

A `package.json`/dependency change is different — that's baked into
`node_modules` at build time, so it still needs a rebuild:

```
git pull
docker build -t southwest-price-notifier .
docker restart southwest-price-notifier-loop
```

## Dashboard

```
npm run dashboard
```

Starts a read-only web dashboard (default port `9786`, override with `PORT`)
showing, per tracked flight: current cheapest price vs. what was paid, a
price-history chart, a raw check log, and — if a flight's `points_paid` in
`config/flights.json` has ever been lowered (i.e. it was canceled and
rebooked cheaper) — the points saved from each rebook, plus a total-saved
banner across all flights.

## Status

Scraper and Gmail auth have both been verified against the live site/API,
including a full end-to-end run in Docker on a Raspberry Pi.
