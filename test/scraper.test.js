import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildSearchUrl, FARE_LABEL_PATTERN, disambiguateByVia } from "../src/scraper.js";

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

describe("disambiguateByVia", () => {
  // Real row text (via a live scrape) glues the connecting airport directly
  // to the duration that follows, with no separator — e.g. "DEN8h 25m" —
  // which is why disambiguateByVia can't rely on a trailing \b.
  const denRow = {
    time: "11:50 AM",
    text: "Departs 11:50AMArrives 5:15PM1 stop Opens flyout.Change planes DEN8h 25m18,500 Points",
    fares: [{ bucket: "Choice", points: 18500 }],
  };
  const ausRow = {
    time: "11:50 AM",
    text: "Departs 11:50AMArrives 6:55PM1 stop Opens flyout.Change planes AUS10h 5m15,500 Points",
    fares: [{ bucket: "Choice", points: 15500 }],
  };

  test("returns the only row unchanged when there's no ambiguity", () => {
    assert.equal(disambiguateByVia([denRow], { id: "x", flight_time: "11:50 AM" }), denRow);
  });

  test("throws when multiple rows match and no via is given", () => {
    assert.throws(
      () => disambiguateByVia([denRow, ausRow], { id: "atl-oak-1201", flight_time: "11:50 AM" }),
      /add a "via"/,
    );
  });

  test("picks the row whose text mentions the given via airport", () => {
    assert.equal(disambiguateByVia([denRow, ausRow], { id: "atl-oak-1201", flight_time: "11:50 AM", via: "DEN" }), denRow);
    assert.equal(disambiguateByVia([denRow, ausRow], { id: "atl-oak-1201", flight_time: "11:50 AM", via: "AUS" }), ausRow);
  });

  test("throws when the via airport matches no row", () => {
    assert.throws(
      () => disambiguateByVia([denRow, ausRow], { id: "atl-oak-1201", flight_time: "11:50 AM", via: "LAS" }),
      /No flight via LAS/,
    );
  });

  test("doesn't false-positive on a via that's a prefix of another code", () => {
    const weirdRow = {
      time: "11:50 AM",
      text: "Departs 11:50AMArrives 6:55PM1 stop Opens flyout.Change planes AUSX10h 5m15,500 Points",
      fares: [],
    };
    assert.throws(
      () => disambiguateByVia([denRow, weirdRow], { id: "atl-oak-1201", flight_time: "11:50 AM", via: "AUS" }),
      /No flight via AUS/,
    );
  });
});
