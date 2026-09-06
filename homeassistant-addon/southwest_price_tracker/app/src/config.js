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

export function loadFlights(flightsPath = FLIGHTS_PATH) {
  let raw;
  try {
    raw = readFileSync(flightsPath, "utf-8");
  } catch (err) {
    if (err.code === "ENOENT") {
      throw new Error(
        `Missing ${flightsPath}. Copy config/flights.example.json to config/flights.json and fill in your tracked flights.`,
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

  // Legs sharing a `group` are booked (and must be canceled) together, so
  // they need to agree on the combined points_paid and threshold — see
  // groupFlights() in index.js, which sums cheapest fares across the group
  // and compares against this shared points_paid.
  const groups = new Map();
  for (const flight of flights) {
    if (!flight.group) continue;
    if (!groups.has(flight.group)) groups.set(flight.group, flight);
    const first = groups.get(flight.group);
    if (first.points_paid !== flight.points_paid || first.notify_threshold_points !== flight.notify_threshold_points) {
      throw new Error(
        `Flights in group "${flight.group}" must share the same points_paid and notify_threshold_points (mismatch between "${first.id}" and "${flight.id}")`,
      );
    }
  }

  return flights;
}
