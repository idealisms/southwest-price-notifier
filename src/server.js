import http from "node:http";
import { loadFlights } from "./config.js";
import { openReadOnlyDb, allPriceChecks, flightPaidHistory } from "./db.js";

const PORT = process.env.PORT ? Number(process.env.PORT) : 9786;
const REFRESH_SECONDS = 300;

const CHART_WIDTH = 640;
const CHART_HEIGHT = 180;
const CHART_PAD = 32;

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);
}

function formatPacific(isoUtc) {
  // SQLite stores checked_at as UTC (datetime('now')); render in Pacific
  // since that's where these flights and the person reading this live.
  const date = new Date(isoUtc.replace(" ", "T") + "Z");
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function renderChart(checks, pointsPaid) {
  if (checks.length === 0) {
    return `<p class="empty">No price checks recorded yet.</p>`;
  }

  const values = checks.map((c) => c.cheapest_points).concat(pointsPaid);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const innerWidth = CHART_WIDTH - CHART_PAD * 2;
  const innerHeight = CHART_HEIGHT - CHART_PAD * 2;

  // Top of the chart = highest price, bottom = lowest, so a price drop reads
  // as the line moving down — matches the intuitive "price is falling" cue.
  const x = (i) => CHART_PAD + (checks.length === 1 ? innerWidth / 2 : (i / (checks.length - 1)) * innerWidth);
  const y = (v) => CHART_PAD + innerHeight - ((v - min) / range) * innerHeight;

  const points = checks.map((c, i) => `${x(i).toFixed(1)},${y(c.cheapest_points).toFixed(1)}`).join(" ");
  const paidY = y(pointsPaid).toFixed(1);

  return `
    <svg class="chart" viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}" role="img" aria-label="Price history chart">
      <line class="chart-paid-line" x1="${CHART_PAD}" y1="${paidY}" x2="${CHART_WIDTH - CHART_PAD}" y2="${paidY}"
            stroke-dasharray="4 3" stroke-width="1" />
      <text class="chart-paid-label" x="${CHART_WIDTH - CHART_PAD}" y="${paidY - 4}" text-anchor="end" font-size="10">paid: ${pointsPaid}</text>
      <polyline class="chart-line" points="${points}" fill="none" stroke-width="2" />
      <text class="chart-axis-label" x="${CHART_PAD}" y="${CHART_PAD - 8}" font-size="10">${max}</text>
      <text class="chart-axis-label" x="${CHART_PAD}" y="${CHART_HEIGHT - CHART_PAD + 12}" font-size="10">${min}</text>
    </svg>
  `;
}

// Rebooking overwrites points_paid in flights.json in place, so consecutive
// flight_paid_history rows for a flight_id are its rebook events — a drop
// from one row to the next is points saved by canceling and rebooking.
function rebookSavings(paidHistory) {
  let totalSaved = 0;
  const rebooks = [];
  for (let i = 1; i < paidHistory.length; i++) {
    const from = paidHistory[i - 1].points_paid;
    const to = paidHistory[i].points_paid;
    if (to < from) totalSaved += from - to;
    rebooks.push({ from, to, at: paidHistory[i].recorded_at });
  }
  return { totalSaved, rebooks };
}

function renderFlight(flight, checks, paidHistory) {
  const latest = checks.length > 0 ? checks[checks.length - 1] : null;
  const isPast = new Date(flight.date) < new Date();

  let indicator = `<span class="indicator neutral">no data yet</span>`;
  if (latest) {
    const drop = flight.points_paid - latest.cheapest_points;
    if (drop > 0) {
      indicator = `<span class="indicator down">▼ ${drop} pts cheaper (${latest.cheapest_points} vs ${flight.points_paid} paid)</span>`;
    } else if (drop < 0) {
      indicator = `<span class="indicator up">▲ ${-drop} pts pricier (${latest.cheapest_points} vs ${flight.points_paid} paid)</span>`;
    } else {
      indicator = `<span class="indicator neutral">unchanged (${latest.cheapest_points} pts)</span>`;
    }
  }

  const rows = checks
    .slice()
    .reverse()
    .slice(0, 50)
    .map(
      (c) => `
      <tr>
        <td>${escapeHtml(formatPacific(c.checked_at))}</td>
        <td>${c.cheapest_points}</td>
        <td>${escapeHtml(c.fare_bucket ?? "")}</td>
      </tr>`,
    )
    .join("");

  const { totalSaved, rebooks } = rebookSavings(paidHistory);
  const rebookSummary =
    totalSaved > 0
      ? `<p class="rebook-summary">Rebooked ${rebooks.length} time${rebooks.length === 1 ? "" : "s"}, saved <strong>${totalSaved} pts</strong> total</p>`
      : "";
  const rebookRows = rebooks
    .map(
      (r) => `
      <tr>
        <td>${escapeHtml(formatPacific(r.at))}</td>
        <td>${r.from} → ${r.to}</td>
        <td>${r.to < r.from ? `saved ${r.from - r.to}` : `+${r.to - r.from}`}</td>
      </tr>`,
    )
    .join("");
  const rebookDetails =
    rebooks.length > 0
      ? `
      <details>
        <summary>Rebooking history (${rebooks.length})</summary>
        <table>
          <thead><tr><th>When</th><th>Points paid change</th><th>Effect</th></tr></thead>
          <tbody>${rebookRows}</tbody>
        </table>
      </details>`
      : "";

  return `
    <section class="flight${isPast ? " past" : ""}">
      <h2>${escapeHtml(flight.origin)} → ${escapeHtml(flight.destination)}
        <span class="date">${escapeHtml(flight.date)} ${escapeHtml(flight.flight_time ?? "")}</span>
        ${isPast ? '<span class="past-badge">past</span>' : ""}
      </h2>
      ${indicator}
      ${rebookSummary}
      ${renderChart(checks, flight.points_paid)}
      <details>
        <summary>Log (${checks.length} check${checks.length === 1 ? "" : "s"})</summary>
        <table>
          <thead><tr><th>Checked</th><th>Points</th><th>Fare bucket</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </details>
      ${rebookDetails}
    </section>
  `;
}

function renderPage(flights, db) {
  const sorted = flights.slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  const perFlight = sorted.map((flight) => ({
    flight,
    checks: allPriceChecks(db, flight.id),
    paidHistory: flightPaidHistory(db, flight.id),
  }));

  const totalSaved = perFlight.reduce((sum, f) => sum + rebookSavings(f.paidHistory).totalSaved, 0);
  const totalBanner =
    totalSaved > 0
      ? `<p class="total-savings">Total saved via rebooking across all flights: <strong>${totalSaved} pts</strong></p>`
      : "";

  const sections = perFlight
    .map(({ flight, checks, paidHistory }) => renderFlight(flight, checks, paidHistory))
    .join("\n");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="refresh" content="${REFRESH_SECONDS}">
<title>Southwest price tracker</title>
<style>
  :root {
    --bg: #fafafa;
    --fg: #111;
    --green: #16a34a;
    --red: #dc2626;
    --muted: #666;
    --muted-strong: #444;
    --card-bg: #fff;
    --card-border: #ddd;
    --badge-bg: #eee;
    --table-border: #eee;
    --chart-line: #2563eb;
    --chart-grid: #999;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #16181c;
      --fg: #e6e6e6;
      --green: #4ade80;
      --red: #f87171;
      --muted: #9a9a9a;
      --muted-strong: #b5b5b5;
      --card-bg: #1f2227;
      --card-border: #333;
      --badge-bg: #2a2d33;
      --table-border: #2f3237;
      --chart-line: #60a5fa;
      --chart-grid: #777;
    }
  }
  body { font-family: system-ui, sans-serif; margin: 1rem; background: var(--bg); color: var(--fg); }
  h1 { font-size: 1.2rem; }
  .total-savings { font-size: 0.95rem; color: var(--green); margin: -0.25rem 0 1rem; }
  .rebook-summary { font-size: 0.85rem; color: var(--green); margin: 0 0 0.5rem; }
  section.flight { background: var(--card-bg); border: 1px solid var(--card-border); border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  section.flight.past { opacity: 0.6; }
  h2 { font-size: 1rem; margin: 0 0 0.5rem; }
  .date { font-weight: normal; color: var(--muted); font-size: 0.85rem; }
  .past-badge { font-size: 0.75rem; background: var(--badge-bg); color: var(--muted); padding: 0.1rem 0.4rem; border-radius: 4px; margin-left: 0.5rem; }
  .indicator { display: inline-block; margin-bottom: 0.5rem; font-size: 0.9rem; }
  .indicator.down { color: var(--green); }
  .indicator.up { color: var(--red); }
  .indicator.neutral { color: var(--muted); }
  .chart { width: 100%; max-width: ${CHART_WIDTH}px; height: auto; display: block; }
  .chart-paid-line { stroke: var(--chart-grid); }
  .chart-paid-label, .chart-axis-label { fill: var(--chart-grid); }
  .chart-line { stroke: var(--chart-line); }
  .empty { color: var(--muted); font-style: italic; }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
  th, td { text-align: left; padding: 0.2rem 0.5rem; border-bottom: 1px solid var(--table-border); }
  details summary { cursor: pointer; font-size: 0.85rem; color: var(--muted-strong); }
</style>
</head>
<body>
<h1>Southwest price tracker</h1>
${totalBanner}
${sections}
</body>
</html>`;
}

function requestHandler(req, res) {
  if (req.method !== "GET" || req.url !== "/") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
    return;
  }

  let db;
  try {
    const flights = loadFlights();
    db = openReadOnlyDb();
    const html = renderPage(flights, db);
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Internal error — see server logs");
  } finally {
    db?.close();
  }
}

http.createServer(requestHandler).listen(PORT, () => {
  console.log(`Dashboard listening on http://0.0.0.0:${PORT}`);
});
