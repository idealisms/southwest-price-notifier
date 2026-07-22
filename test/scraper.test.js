import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildSearchUrl, FARE_LABEL_PATTERN } from "../src/scraper.js";

describe("buildSearchUrl", () => {
  test("includes origin, destination, date, and points fare type", () => {
    const url = new URL(buildSearchUrl({ origin: "OAK", destination: "PDX", date: "2026-08-09" }));
    assert.equal(url.searchParams.get("originationAirportCode"), "OAK");
    assert.equal(url.searchParams.get("destinationAirportCode"), "PDX");
    assert.equal(url.searchParams.get("departureDate"), "2026-08-09");
    assert.equal(url.searchParams.get("fareType"), "POINTS");
    assert.equal(url.searchParams.get("tripType"), "oneway");
  });
});

describe("FARE_LABEL_PATTERN", () => {
  test("matches a typical fare aria-label and captures bucket + points", () => {
    const label = "Choice fare 12,500 PTS. Additional taxes and fees of dollars 5.60 will be added.";
    const match = label.match(FARE_LABEL_PATTERN);
    assert.ok(match);
    assert.equal(match[1], "Choice");
    assert.equal(match[2], "12,500");
  });

  test("does not match unrelated aria-labels", () => {
    assert.equal("Dismiss".match(FARE_LABEL_PATTERN), null);
    assert.equal("Sold out".match(FARE_LABEL_PATTERN), null);
  });
});
