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
  // TODO(open question, see PLAN.md): confirm whether Southwest's search
  // results page can be deep-linked with query params (origin/destination/date/
  // points-fare toggle) to skip UI interaction entirely. This URL shape is a
  // best guess and needs live verification.
  const params = new URLSearchParams({
    originationAirportCode: origin,
    destinationAirportCode: destination,
    departureDate: date,
    tripType: "oneway",
    adultPassengersCount: "1",
    fareType: "POINTS",
  });
  return `https://www.southwest.com/air/booking/select.html?${params.toString()}`;
}

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

    // TODO(open question, see PLAN.md): Southwest's fare-bucket DOM structure
    // needs live inspection. This selector is a placeholder — iterate against
    // the real results page before relying on this.
    const fareBuckets = await page.$$eval(
      "[data-test='fare-button'] .fare-button--price-text",
      (nodes) =>
        nodes
          .map((el) => parseInt(el.textContent.replace(/[^0-9]/g, ""), 10))
          .filter((n) => !Number.isNaN(n)),
    );

    if (fareBuckets.length === 0) {
      throw new Error(`No fare buckets found for flight ${flight.id} — selectors likely stale`);
    }

    const cheapestPoints = Math.min(...fareBuckets);

    return { cheapestPoints, fareBucket: null };
  } finally {
    await randomDelay();
    await context.storageState({ path: STORAGE_STATE_PATH });
    await browser.close();
  }
}
