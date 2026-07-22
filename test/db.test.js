import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import Database from "better-sqlite3";
import {
  initSchema,
  recordPriceCheck,
  allPriceChecks,
  latestPriceCheck,
  recordFlightPaidIfChanged,
  flightPaidHistory,
} from "../src/db.js";

let db;
beforeEach(() => {
  db = new Database(":memory:");
  initSchema(db);
});

describe("price_checks", () => {
  test("recordPriceCheck + allPriceChecks round-trip", () => {
    recordPriceCheck(db, { flightId: "oak-pdx", cheapestPoints: 9000, fareBucket: "Choice" });
    recordPriceCheck(db, { flightId: "oak-pdx", cheapestPoints: 8500, fareBucket: "Basic" });
    recordPriceCheck(db, { flightId: "other-flight", cheapestPoints: 1, fareBucket: null });

    const checks = allPriceChecks(db, "oak-pdx");
    assert.equal(checks.length, 2);
    assert.equal(checks[0].cheapest_points, 9000);
    assert.equal(checks[1].cheapest_points, 8500);
  });

  test("fareBucket defaults to null when omitted", () => {
    recordPriceCheck(db, { flightId: "oak-pdx", cheapestPoints: 9000 });
    const [check] = allPriceChecks(db, "oak-pdx");
    assert.equal(check.fare_bucket, null);
  });

  test("latestPriceCheck returns the most recent row for a flight", () => {
    recordPriceCheck(db, { flightId: "oak-pdx", cheapestPoints: 9000, fareBucket: "Choice" });
    recordPriceCheck(db, { flightId: "oak-pdx", cheapestPoints: 8500, fareBucket: "Basic" });
    const latest = latestPriceCheck(db, "oak-pdx");
    assert.equal(latest.cheapest_points, 8500);
  });

  test("latestPriceCheck returns undefined for an unknown flight", () => {
    assert.equal(latestPriceCheck(db, "no-such-flight"), undefined);
  });
});

describe("flight_paid_history", () => {
  test("first call for a flight always records a snapshot", () => {
    recordFlightPaidIfChanged(db, { flightId: "oak-pdx", pointsPaid: 9000 });
    const history = flightPaidHistory(db, "oak-pdx");
    assert.equal(history.length, 1);
    assert.equal(history[0].points_paid, 9000);
  });

  test("repeating the same points_paid does not add a new row", () => {
    recordFlightPaidIfChanged(db, { flightId: "oak-pdx", pointsPaid: 9000 });
    recordFlightPaidIfChanged(db, { flightId: "oak-pdx", pointsPaid: 9000 });
    recordFlightPaidIfChanged(db, { flightId: "oak-pdx", pointsPaid: 9000 });
    assert.equal(flightPaidHistory(db, "oak-pdx").length, 1);
  });

  test("a changed points_paid adds a new row, preserving history", () => {
    recordFlightPaidIfChanged(db, { flightId: "oak-pdx", pointsPaid: 9000 });
    recordFlightPaidIfChanged(db, { flightId: "oak-pdx", pointsPaid: 7500 });
    const history = flightPaidHistory(db, "oak-pdx");
    assert.equal(history.length, 2);
    assert.equal(history[0].points_paid, 9000);
    assert.equal(history[1].points_paid, 7500);
  });
});
