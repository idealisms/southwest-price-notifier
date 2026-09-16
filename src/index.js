import { loadFlights } from "./config.js";
import { openDb, recordPriceCheck, recordFlightPaidIfChanged } from "./db.js";
import { checkFlightPrice } from "./scraper.js";
import { sendEmail, formatPriceDropEmail, formatErrorEmail } from "./email.js";

const NOTIFY_TO = process.env.NOTIFY_EMAIL;

// Southwest doesn't sell already-departed flights, so scraping a past date
// just burns a retry and a browser launch before failing — compare as
// Pacific-local date/time (where these flights actually depart) rather than
// server-local/UTC "now", so a flight isn't skipped a day early/late purely
// because of the server's timezone. Comparing only the date (not the time)
// let a same-day flight look "active" for hours after it had already
// departed, since the calendar date doesn't roll over until midnight — so
// once flight_time is known, compare the full departure timestamp instead.
export function isPastFlight(flight, now = new Date()) {
  const nowPacific = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .formatToParts(now)
    .reduce((acc, { type, value }) => ({ ...acc, [type]: value }), {});
  const todayPacific = `${nowPacific.year}-${nowPacific.month}-${nowPacific.day}`;

  if (flight.date !== todayPacific) return flight.date < todayPacific;
  if (!flight.flight_time) return false;

  const match = flight.flight_time.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return false;
  let [, hour, minute, meridiem] = match;
  hour = Number(hour) % 12;
  if (meridiem.toUpperCase() === "PM") hour += 12;
  const flightMinutes = hour * 60 + Number(minute);
  const nowMinutes = Number(nowPacific.hour) * 60 + Number(nowPacific.minute);
  return nowMinutes >= flightMinutes;
}

// Flights sharing a `group` (e.g. the two legs of a round trip) are booked
// and canceled together, so their combined cheapest fare — not each leg in
// isolation — is what determines whether cancel-and-rebook is worth it.
export function groupFlights(flights) {
  const groups = new Map();
  for (const flight of flights) {
    const key = flight.group ?? flight.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(flight);
  }
  return [...groups.values()];
}

async function main() {
  const flights = loadFlights();
  const db = openDb();
  const results = new Map(); // flight.id -> { cheapestPoints, fareBucket }
  const errors = [];

  for (const flight of flights) {
    recordFlightPaidIfChanged(db, { flightId: flight.id, pointsPaid: flight.points_paid });
  }

  const pastFlights = flights.filter((f) => isPastFlight(f));
  if (pastFlights.length > 0) {
    console.log(`Skipping ${pastFlights.length} already-flown flight(s): ${pastFlights.map((f) => f.id).join(", ")}`);
  }
  const activeFlights = flights.filter((f) => !isPastFlight(f));

  for (const flight of activeFlights) {
    let result;
    try {
      result = await checkFlightPrice(flight);
    } catch (err) {
      // One retry absorbs transient timeouts (slow page load, brief resource
      // contention from back-to-back browser launches) without masking a
      // persistent block or a stale selector, which will fail again below.
      console.error(`Failed to check ${flight.id}, retrying once:`, err.message);
      await new Promise((resolve) => setTimeout(resolve, 5000));
      try {
        result = await checkFlightPrice(flight);
      } catch (retryErr) {
        console.error(`Retry failed for ${flight.id}:`, retryErr.message);
        errors.push({ flightId: flight.id, message: retryErr.message });
        continue;
      }
    }

    results.set(flight.id, result);
    recordPriceCheck(db, {
      flightId: flight.id,
      cheapestPoints: result.cheapestPoints,
      fareBucket: result.fareBucket,
    });
    console.log(`${flight.id}: cheapest now ${result.cheapestPoints} pts (${result.fareBucket})`);
  }

  const drops = [];
  for (const legs of groupFlights(activeFlights)) {
    if (legs.some((leg) => !results.has(leg.id))) {
      console.error(`Skipping group with missing leg data: ${legs.map((l) => l.id).join(", ")}`);
      continue;
    }

    const cheapestPoints = legs.reduce((sum, leg) => sum + results.get(leg.id).cheapestPoints, 0);
    const pointsPaid = legs[0].points_paid;
    const drop = pointsPaid - cheapestPoints;
    console.log(`Group ${legs.map((l) => l.id).join("+")}: paid ${pointsPaid}, now ${cheapestPoints} (drop ${drop})`);

    if (drop >= legs[0].notify_threshold_points) {
      drops.push({
        legs: legs.map((l) => ({ origin: l.origin, destination: l.destination, date: l.date })),
        pointsPaid,
        cheapestPoints,
      });
    }
  }

  if (drops.length > 0) {
    if (!NOTIFY_TO) {
      console.error("Price drops found but NOTIFY_EMAIL is not set — skipping email.");
    } else {
      const { subject, body } = formatPriceDropEmail(drops);
      await sendEmail({ to: NOTIFY_TO, subject, body });
      console.log(`Sent alert email to ${NOTIFY_TO}: ${subject}`);
    }
  } else {
    console.log("No price drops above threshold.");
  }

  if (errors.length > 0) {
    if (!NOTIFY_TO) {
      console.error(`${errors.length} flight(s) failed to check but NOTIFY_EMAIL is not set — skipping error email.`);
    } else {
      const { subject, body } = formatErrorEmail(errors);
      await sendEmail({ to: NOTIFY_TO, subject, body });
      console.log(`Sent error alert email to ${NOTIFY_TO}: ${subject}`);
    }
  }

  db.close();
}

// Guards against running the scraper just by importing this module (e.g.
// from a test, or a REPL poking at isPastFlight/groupFlights) — main() only
// fires when this file is executed directly, same as Python's `if __name__
// == "__main__"`.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (err) => {
    console.error(err);
    if (NOTIFY_TO) {
      try {
        await sendEmail({
          to: NOTIFY_TO,
          subject: "Southwest tracker error: run failed",
          body: `The tracker crashed before finishing:\n\n${err.stack ?? err.message}`,
        });
      } catch (emailErr) {
        console.error("Also failed to send crash alert email:", emailErr.message);
      }
    }
    process.exit(1);
  });
}
