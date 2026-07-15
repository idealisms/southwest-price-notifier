import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FLIGHTS_PATH = path.join(__dirname, "..", "config", "flights.json");

const REQUIRED_FIELDS = [
  "id",
  "origin",
  "destination",
  "date",
  "points_paid",
  "notify_threshold_points",
];

export function loadFlights() {
  let raw;
  try {
    raw = readFileSync(FLIGHTS_PATH, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        `Missing ${FLIGHTS_PATH}. Copy config/flights.example.json to config/flights.json and fill in your tracked flights.`,
      );
    }
    throw err;
  }

  const flights = JSON.parse(raw);
  if (!Array.isArray(flights) || flights.length === 0) {
    throw new Error("config/flights.json must be a non-empty array of flights");
  }

  for (const flight of flights) {
    for (const field of REQUIRED_FIELDS) {
      if (flight[field] === undefined) {
        throw new Error(`Flight ${flight.id ?? "(unknown)"} is missing required field "${field}"`);
      }
    }
  }

  return flights;
}
