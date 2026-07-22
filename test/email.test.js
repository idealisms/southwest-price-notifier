import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildRawMessage, formatPriceDropEmail, formatErrorEmail } from "../src/email.js";

describe("buildRawMessage", () => {
  test("base64url-encodes a valid RFC 2822-ish message", () => {
    const raw = buildRawMessage({ to: "a@b.com", subject: "Hi", body: "hello" });
    const decoded = Buffer.from(raw, "base64url").toString("utf-8");
    assert.match(decoded, /^To: a@b\.com/);
    assert.match(decoded, /Subject: Hi/);
    assert.match(decoded, /\n\nhello$/);
  });

  test("output contains no base64url-unsafe characters", () => {
    const raw = buildRawMessage({ to: "a@b.com", subject: "x".repeat(50), body: "y".repeat(50) });
    assert.doesNotMatch(raw, /[+/=]/);
  });
});

describe("formatPriceDropEmail", () => {
  test("subject totals savings across all drops", () => {
    const { subject } = formatPriceDropEmail([
      { legs: [{ origin: "OAK", destination: "PDX", date: "2026-08-09" }], pointsPaid: 9000, cheapestPoints: 7500 },
      { legs: [{ origin: "OAK", destination: "SNA", date: "2026-12-24" }], pointsPaid: 8500, cheapestPoints: 7500 },
    ]);
    assert.match(subject, /2,500 pts/);
  });

  test("body lists each drop's route and numbers", () => {
    const { body } = formatPriceDropEmail([
      { legs: [{ origin: "OAK", destination: "PDX", date: "2026-08-09" }], pointsPaid: 9000, cheapestPoints: 7500 },
    ]);
    assert.match(body, /OAK -> PDX \(2026-08-09\)/);
    assert.match(body, /Paid: 9,000 pts \| Now: 7,500 pts \| Save: 1,500 pts/);
  });
});

describe("formatErrorEmail", () => {
  test("subject counts failed flights, body lists each", () => {
    const { subject, body } = formatErrorEmail([
      { flightId: "oak-pdx", message: "timeout" },
      { flightId: "oak-sna", message: "stale selector" },
    ]);
    assert.match(subject, /^Southwest tracker error: 2 flight\(s\) failed to check$/);
    assert.match(body, /oak-pdx: timeout/);
    assert.match(body, /oak-sna: stale selector/);
  });
});
