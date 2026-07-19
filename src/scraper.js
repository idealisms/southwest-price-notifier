import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";

chromium.use(stealth());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE_PATH = path.join(__dirname, "..", "storage-state.json");

function randomDelay(minMs = 1000, maxMs = 4000) {
  return new Promise((resolve) =>
    setTimeout(resolve, minMs + Math.random() * (maxMs - minMs)),
  );
}

function randomViewport() {
  const base = { width: 1366, height: 850 };
  return {
    width: base.width + Math.floor(Math.random() * 40 - 20),
    height: base.height + Math.floor(Math.random() * 40 - 20),
  };
}

function buildSearchUrl({ origin, destination, date }) {
  // Deep-linking pre-fills the booking form but does not auto-submit the
  // search — see checkFlightPrice, which still has to click "Search flights".
  const params = new URLSearchParams({
    adultsCount: "1",
    adultPassengersCount: "1",
    originationAirportCode: origin,
    destinationAirportCode: destination,
    departureDate: date,
    departureTimeOfDay: "ALL_DAY",
    returnDate: "",
    returnTimeOfDay: "ALL_DAY",
    tripType: "oneway",
    fareType: "POINTS",
    passengerType: "ADULT",
    promoCode: "",
  });
  return `https://www.southwest.com/air/booking/select-depart.html?${params.toString()}`;
}

// Fare buttons render an aria-label like "Choice fare 12,500 PTS. Additional
// taxes and fees of dollars 5.60 will be added. ...". Unavailable fares don't
// match this pattern, so they're naturally excluded.
const FARE_LABEL_PATTERN = /^(.+?) fare ([\d,]+) PTS/;

/**
 * Checks the cheapest available points price for a single flight.
 * Returns { cheapestPoints, fareBucket } or throws on scrape failure.
 */
export async function checkFlightPrice(flight) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: randomViewport(),
    storageState: existsSync(STORAGE_STATE_PATH) ? STORAGE_STATE_PATH : undefined,
  });

  try {
    const page = await context.newPage();
    await page.goto(buildSearchUrl(flight), { waitUntil: "domcontentloaded" });
    await randomDelay();

    try {
      await page.getByRole("button", { name: /dismiss/i }).click({ timeout: 3000 });
    } catch {
      // no cookie banner shown
    }

    try {
      // Clicking this button navigates immediately, which can race Playwright's
      // post-click stability check and throw even though the click succeeded —
      // the waitForSelector below is the real success signal, not this click.
      await page.getByRole("button", { name: /search flights/i }).click({ timeout: 10000 });
    } catch {
      // ignored — see comment above
    }
    await page.waitForSelector("button[aria-label*=' PTS.']", { timeout: 20000 });
    await randomDelay();

    // Each departure has its own row with its own fare buttons, so fares must
    // be scoped per-row — grabbing all buttons on the page mixes fares from
    // unrelated flight times together.
    const rows = await page.$$eval(
      "li.air-booking-select-detail",
      (nodes, patternSrc) => {
        const pattern = new RegExp(patternSrc);
        return nodes.map((row) => {
          const timeMatch = (row.textContent || "").match(/Departs\s*(\d{1,2}:\d{2})\s*(AM|PM)/i);
          const time = timeMatch ? `${timeMatch[1]} ${timeMatch[2].toUpperCase()}` : null;
          const fares = Array.from(row.querySelectorAll("button[aria-label*=' PTS.']"))
            .map((el) => {
              const match = (el.getAttribute("aria-label") || "").match(pattern);
              if (!match) return null;
              return { bucket: match[1], points: parseInt(match[2].replace(/,/g, ""), 10) };
            })
            .filter(Boolean);
          return { time, fares };
        });
      },
      FARE_LABEL_PATTERN.source,
    );

    let fares;
    if (flight.flight_time) {
      const row = rows.find((r) => r.time === flight.flight_time);
      if (!row) {
        const available = rows.map((r) => r.time).join(", ");
        throw new Error(
          `No flight departing at ${flight.flight_time} found for ${flight.id} (available: ${available})`,
        );
      }
      fares = row.fares;
    } else {
      fares = rows.flatMap((r) => r.fares);
    }

    if (fares.length === 0) {
      throw new Error(`No fare buckets found for flight ${flight.id} — selectors likely stale`);
    }

    const cheapest = fares.reduce((min, f) => (f.points < min.points ? f : min));

    return { cheapestPoints: cheapest.points, fareBucket: cheapest.bucket };
  } finally {
    await randomDelay();
    await context.storageState({ path: STORAGE_STATE_PATH });
    await browser.close();
  }
}
