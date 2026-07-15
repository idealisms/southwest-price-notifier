// One-time interactive helper: opens a real (headed) browser so you can log
// into southwest.com manually, then saves the session to storage-state.json
// for the headless scraper to reuse. Run with `npm run login`.
import { chromium } from "playwright-extra";
import stealth from "puppeteer-extra-plugin-stealth";
import { fileURLToPath } from "node:url";
import path from "node:path";

chromium.use(stealth());

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORAGE_STATE_PATH = path.join(__dirname, "..", "storage-state.json");

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();
await page.goto("https://www.southwest.com/");

console.log("Log in manually in the opened browser window, then press Enter here to save the session.");
await new Promise((resolve) => process.stdin.once("data", resolve));

await context.storageState({ path: STORAGE_STATE_PATH });
console.log(`Saved session to ${STORAGE_STATE_PATH}`);
await browser.close();
process.exit(0);
