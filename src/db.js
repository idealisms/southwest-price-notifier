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
  `);
  return db;
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
