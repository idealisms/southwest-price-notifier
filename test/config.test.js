import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadFlights } from "../src/config.js";

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
