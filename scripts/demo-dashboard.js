// Runs the dashboard against a throwaway copy of flights.json and the price
// history db, with fake price drops injected so the rebook button (and its
// undo) can be tried without touching real data. The copy is deleted when
// the server stops.
//
//   npm run demo                                  # snapshot local config/ + data/
//   npm run demo -- --from-pi hassio@192.168.x.y  # snapshot the Pi's live data
//   npm run demo -- --drop atl-oak-1201=16000     # choose the fake drops
//
// Without --drop, every upcoming ungrouped flight gets a fake check 1000 pts
// below what was paid.

import { spawn, execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Database from "better-sqlite3";
import { loadFlights } from "../src/config.js";
import { recordPriceCheck } from "../src/db.js";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_DROP = 1000;

const { values: args } = parseArgs({
  options: {
    "from-pi": { type: "string" },
    "remote-dir": { type: "string", default: "/share/southwest-price-notifier" },
    drop: { type: "string", multiple: true, default: [] },
    port: { type: "string", default: "9799" },
  },
});

const scratch = mkdtempSync(path.join(tmpdir(), "sw-demo-"));
const flightsPath = path.join(scratch, "flights.json");
const dbPath = path.join(scratch, "price-history.db");

if (args["from-pi"]) {
  const host = args["from-pi"];
  const remote = args["remote-dir"];
  // The loop container may be writing mid-copy, so take a consistent
  // snapshot with sqlite3's .backup rather than copying the live db file.
  // The SSH add-on's scp needs the legacy protocol (-O).
  const remoteSnapshot = `${remote}/_demo-snapshot.db`;
  execFileSync("ssh", [host, `sqlite3 -readonly ${remote}/data/price-history.db '.backup ${remoteSnapshot}'`], { stdio: "inherit" });
  try {
    execFileSync("scp", ["-O", "-q", `${host}:${remoteSnapshot}`, dbPath], { stdio: "inherit" });
    execFileSync("scp", ["-O", "-q", `${host}:${remote}/config/flights.json`, flightsPath], { stdio: "inherit" });
  } finally {
    execFileSync("ssh", [host, `rm -f ${remoteSnapshot}`], { stdio: "inherit" });
  }
} else {
  copyFileSync(path.join(ROOT, "config", "flights.json"), flightsPath);
  const src = new Database(path.join(ROOT, "data", "price-history.db"), { readonly: true, fileMustExist: true });
  await src.backup(dbPath);
  src.close();
}

const flights = loadFlights(flightsPath);
let drops;
if (args.drop.length > 0) {
  drops = args.drop.map((spec) => {
    const [flightId, points] = spec.split("=");
    if (!flights.some((f) => f.id === flightId) || !Number.isInteger(Number(points))) {
      throw new Error(`Bad --drop "${spec}": expected <flight id>=<points>`);
    }
    return { flightId, cheapestPoints: Number(points) };
  });
} else {
  const now = new Date();
  drops = flights
    .filter((f) => !f.group && new Date(f.date) >= now)
    .map((f) => ({ flightId: f.id, cheapestPoints: f.points_paid - DEFAULT_DROP }));
}

const db = new Database(dbPath);
for (const { flightId, cheapestPoints } of drops) {
  recordPriceCheck(db, { flightId, cheapestPoints, fareBucket: "Demo" });
}
db.close();

console.log(`Scratch copy: ${scratch}`);
for (const { flightId, cheapestPoints } of drops) console.log(`  fake drop: ${flightId} -> ${cheapestPoints} pts`);

const server = spawn(process.execPath, [path.join(ROOT, "src", "server.js")], {
  stdio: "inherit",
  env: {
    ...process.env,
    FLIGHTS_PATH: flightsPath,
    DATA_DIR: scratch,
    PORT: args.port,
    APP_VERSION: "demo",
  },
});

function cleanup() {
  rmSync(scratch, { recursive: true, force: true });
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => {
  cleanup();
  process.exit(code ?? 0);
});
