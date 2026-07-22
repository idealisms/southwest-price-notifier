import Database from "better-sqlite3";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { mkdirSync } from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "price-history.db");

export function openDb() {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_checks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_id TEXT NOT NULL,
      checked_at TEXT NOT NULL DEFAULT (datetime('now')),
      cheapest_points INTEGER NOT NULL,
      fare_bucket TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_price_checks_flight_id ON price_checks(flight_id);
    CREATE TABLE IF NOT EXISTS flight_paid_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      flight_id TEXT NOT NULL,
      points_paid INTEGER NOT NULL,
      recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_flight_paid_history_flight_id ON flight_paid_history(flight_id);
  `);
  return db;
}

// Separate from openDb() because the dashboard only ever reads: no table
// creation (the loop container owns schema setup) and no write access, so a
// stale/missing db file surfaces as a clear error rather than silently
// creating an empty one.
export function openReadOnlyDb() {
  return new Database(DB_PATH, { readonly: true, fileMustExist: true });
}

export function allPriceChecks(db, flightId) {
  return db
    .prepare(
      `SELECT * FROM price_checks WHERE flight_id = ? ORDER BY checked_at ASC`,
    )
    .all(flightId);
}

export function recordPriceCheck(db, { flightId, cheapestPoints, fareBucket }) {
  db.prepare(
    `INSERT INTO price_checks (flight_id, cheapest_points, fare_bucket) VALUES (?, ?, ?)`,
  ).run(flightId, cheapestPoints, fareBucket ?? null);
}

export function latestPriceCheck(db, flightId) {
  return db
    .prepare(
      `SELECT * FROM price_checks WHERE flight_id = ? ORDER BY checked_at DESC LIMIT 1`,
    )
    .get(flightId);
}

// Cancel-and-rebook changes points_paid in flights.json in place (same
// flight_id, since it's still the same physical segment), which otherwise
// leaves no record of what was paid before — call once per flight per run
// so the dashboard can show rebooking savings over time.
export function recordFlightPaidIfChanged(db, { flightId, pointsPaid }) {
  const latest = db
    .prepare(
      `SELECT * FROM flight_paid_history WHERE flight_id = ? ORDER BY id DESC LIMIT 1`,
    )
    .get(flightId);
  if (latest && latest.points_paid === pointsPaid) return;
  db.prepare(
    `INSERT INTO flight_paid_history (flight_id, points_paid) VALUES (?, ?)`,
  ).run(flightId, pointsPaid);
}

export function flightPaidHistory(db, flightId) {
  return db
    .prepare(
      `SELECT * FROM flight_paid_history WHERE flight_id = ? ORDER BY recorded_at ASC, id ASC`,
    )
    .all(flightId);
}
