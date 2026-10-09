import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadFlights, updatePointsPaid } from "../src/config.js";

function writeFlights(flights) {
  const dir = mkdtempSync(path.join(tmpdir(), "flights-test-"));
  const file = path.join(dir, "flights.json");
  writeFileSync(file, JSON.stringify(flights));
  return { dir, file };
}

describe("loadFlights", () => {
  test("throws a helpful error when the file is missing", () => {
    const missingPath = path.join(tmpdir(), "definitely-does-not-exist", "flights.json");
    assert.throws(() => loadFlights(missingPath), /Missing .*flights\.json/);
  });

  test("throws when the file isn't a non-empty array", () => {
    const { dir, file } = writeFlights([]);
    try {
      assert.throws(() => loadFlights(file), /non-empty array/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("throws when a required field is missing", () => {
    const { dir, file } = writeFlights([
      { id: "oak-pdx", origin: "OAK", destination: "PDX", date: "2026-08-09", points_paid: 9000 },
    ]);
    try {
      assert.throws(() => loadFlights(file), /missing required field "notify_threshold_points"/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("throws when grouped legs disagree on points_paid", () => {
    const { dir, file } = writeFlights([
      {
        id: "lax-sea",
        group: "rt",
        origin: "LAX",
        destination: "SEA",
        date: "2026-09-01",
        points_paid: 24000,
        notify_threshold_points: 500,
      },
      {
        id: "sea-lax",
        group: "rt",
        origin: "SEA",
        destination: "LAX",
        date: "2026-09-05",
        points_paid: 20000,
        notify_threshold_points: 500,
      },
    ]);
    try {
      assert.throws(() => loadFlights(file), /must share the same points_paid/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("accepts grouped legs that agree, and standalone flights", () => {
    const { dir, file } = writeFlights([
      {
        id: "lax-sea",
        group: "rt",
        origin: "LAX",
        destination: "SEA",
        date: "2026-09-01",
        points_paid: 24000,
        notify_threshold_points: 500,
      },
      {
        id: "sea-lax",
        group: "rt",
        origin: "SEA",
        destination: "LAX",
        date: "2026-09-05",
        points_paid: 24000,
        notify_threshold_points: 500,
      },
      {
        id: "atl-den",
        origin: "ATL",
        destination: "DEN",
        date: "2026-08-15",
        points_paid: 12500,
        notify_threshold_points: 500,
      },
    ]);
    try {
      const flights = loadFlights(file);
      assert.equal(flights.length, 3);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

describe("updatePointsPaid", () => {
  const base = { origin: "ATL", destination: "OAK", date: "2026-12-01", notify_threshold_points: 500 };

  test("rewrites only the target flight's points_paid and returns the old value", () => {
    const { dir, file } = writeFlights([
      { ...base, id: "atl-oak", via: "DEN", points_paid: 18500 },
      { ...base, id: "oak-atl", origin: "OAK", destination: "ATL", points_paid: 17000 },
    ]);
    try {
      const { previous } = updatePointsPaid("atl-oak", 17500, file);
      assert.equal(previous, 18500);
      const flights = JSON.parse(readFileSync(file, "utf-8"));
      assert.deepEqual(flights[0], { ...base, id: "atl-oak", via: "DEN", points_paid: 17500 });
      assert.equal(flights[1].points_paid, 17000);
      assert.equal(existsSync(`${file}.tmp`), false);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("throws for an unknown flight id without touching the file", () => {
    const { dir, file } = writeFlights([{ ...base, id: "atl-oak", points_paid: 18500 }]);
    try {
      const before = readFileSync(file, "utf-8");
      assert.throws(() => updatePointsPaid("nope", 1000, file), /No flight with id "nope"/);
      assert.equal(readFileSync(file, "utf-8"), before);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  test("refuses grouped flights", () => {
    const { dir, file } = writeFlights([
      { ...base, id: "a", group: "rt", points_paid: 30000 },
      { ...base, id: "b", group: "rt", points_paid: 30000 },
    ]);
    try {
      assert.throws(() => updatePointsPaid("a", 25000, file), /is in group "rt"/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
