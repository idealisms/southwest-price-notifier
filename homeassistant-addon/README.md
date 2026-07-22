# Home Assistant add-on — `southwest_price_tracker`

A local Home Assistant Supervisor add-on that puts the price-tracker
dashboard (`src/server.js`) in the HA sidebar via ingress, so it's reachable
over the existing `https://` HA origin with no separate port, certificate,
or unauthenticated LAN exposure.

This replaced an earlier standalone `docker run` container that published
`src/server.js` directly on a LAN port. That approach hit two problems:
HTTPS-served HA instances refuse to iframe a plain `http://` URL (mixed
content), and a published port is reachable by anyone on the LAN, not just
people logged into HA. Ingress solves both — HA's Supervisor proxies the
add-on's UI through HA's own already-HTTPS origin, gated by an actual HA
login.

## Why this isn't just the root `Dockerfile`

The repo's top-level `Dockerfile` builds the main `southwest-price-notifier`
image used by the `southwest-price-notifier-loop` container (the scraper) —
it's based on Microsoft's Playwright image because the loop needs a real
Chromium, and it's ~2.9GB as a result. This add-on never scrapes, so
reusing that image would mean shipping Chromium into HA's add-on store for
no reason. Instead, `southwest_price_tracker/Dockerfile` builds its own
minimal image (`node:22-bookworm-slim` + a from-scratch compile of just
`better-sqlite3`, the only native dependency `server.js` needs) — about
260MB instead of 2.9GB.

## Layout

```
homeassistant-addon/southwest_price_tracker/
  config.yaml   — HA add-on manifest (ingress config, arch, the `share:rw` map)
  Dockerfile    — builds the add-on's own minimal node + better-sqlite3 image
  app/src/      — copies of server.js, config.js, db.js from the main src/
```

`app/src/*.js` are **copies**, not symlinks or a shared build step — Home
Assistant Supervisor builds a local add-on using only that add-on's own
directory as the Docker build context, so it can't reach the main repo's
`src/` at build time. They're small, rarely-changed files; re-copy them here
by hand after editing the originals in `src/`:

```
cp src/server.js src/config.js src/db.js homeassistant-addon/southwest_price_tracker/app/src/
```

## How it reaches the real data

`config.yaml`'s `map: [share:rw]` mounts HAOS's `/share` into the add-on
container — the same folder the loop container's `config`/`data` mounts
live under (`/share/southwest-price-notifier/...`, where this repo is
checked out on the Pi). The add-on's `Dockerfile` symlinks `/app/config` and
`/app/data` to that real path, so the *unmodified* `config.js`/`db.js` (which
resolve those
directories relative to `src/`'s own location, same as in the main app) read
the exact same `flights.json` and `price-history.db` the loop container
writes — no data duplication, no path-override code needed.

The mount is read-write, not `:ro`, even though the add-on's own SQLite
connection is opened `{ readonly: true }` and never writes: SQLite's WAL
mode needs to create/open `-shm`/`-wal` sidecar files even for plain reads,
which requires write access to the containing directory. A `:ro` mount
throws `SQLITE_CANTOPEN` on the first query (hit and fixed live on the
standalone-container version of this dashboard before the add-on existed).

## Deploying a change

There's no CI/registry push — Supervisor builds the image locally from
whatever's on disk under HAOS's `/addons` (mapped from
`/mnt/data/supervisor/apps/local` on the actual host — HAOS's SSH add-on
exposes several of these Supervisor-managed folders under different-looking
paths than their real host location; `/share` has the same kind of
indirection). After editing anything here:

1. Re-copy `app/src/*.js` if `src/*.js` changed (see above)
2. `scp -O -r` this folder to the Pi, staged under the writable
   `/share/southwest-price-notifier/` first (`/addons` itself needs `sudo`,
   which `scp` can't do mid-transfer), then `sudo cp -r` it into
   `/addons/southwest_price_tracker` and remove the staged copy
3. In the HA UI: Settings → Add-ons → Add-on Store → ⋮ → Check for
   updates/Reload, then rebuild/restart the add-on from its page

There's no Supervisor API token available from the SSH add-on's session
(confirmed 2026-07-21), so the reload/rebuild/restart itself has to happen
in the UI — it can't be scripted from SSH.
