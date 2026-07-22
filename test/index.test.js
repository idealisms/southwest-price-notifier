import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isPastFlight, groupFlights } from "../src/index.js";

describe("isPastFlight", () => {
  const noon2026_07_22_UTC = new Date("2026-07-22T12:00:00Z");

  test("a date before today (Pacific) is past", () => {
    assert.equal(isPastFlight({ date: "2026-07-21" }, noon2026_07_22_UTC), true);
  });

  test("today (Pacific) is not past", () => {
    assert.equal(isPastFlight({ date: "2026-07-22" }, noon2026_07_22_UTC), false);
  });

  test("a future date is not past", () => {
    assert.equal(isPastFlight({ date: "2026-08-09" }, noon2026_07_22_UTC), false);
  });

  test("uses Pacific time, not UTC — a UTC-past date can still be 'today' in Pacific", () => {
    // 2026-07-22T05:00:00Z is 2026-07-21 22:00 Pacific (PDT, UTC-7) — still
    // "today" for a flight dated 2026-07-21, even though UTC has already
    // rolled over to the 22nd.
    const earlyUTC = new Date("2026-07-22T05:00:00Z");
    assert.equal(isPastFlight({ date: "2026-07-21" }, earlyUTC), false);
  });
});

describe("groupFlights", () => {
  test("flights without a group are each their own group", () => {
    const flights = [
      { id: "a", origin: "OAK", destination: "PDX" },
      { id: "b", origin: "PDX", destination: "OAK" },
    ];
    const groups = groupFlights(flights);
    assert.equal(groups.length, 2);
    assert.deepEqual(
      groups.map((g) => g.map((f) => f.id)),
      [["a"], ["b"]],
    );
  });

  test("flights sharing a group are grouped together", () => {
    const flights = [
      { id: "lax-sea", group: "rt", origin: "LAX", destination: "SEA" },
      { id: "sea-lax", group: "rt", origin: "SEA", destination: "LAX" },
      { id: "atl-den", origin: "ATL", destination: "DEN" },
    ];
    const groups = groupFlights(flights);
    assert.equal(groups.length, 2);
    const rtGroup = groups.find((g) => g.length === 2);
    assert.deepEqual(
      rtGroup.map((f) => f.id),
      ["lax-sea", "sea-lax"],
    );
  });
});
