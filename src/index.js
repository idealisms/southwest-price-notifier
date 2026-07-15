import { loadFlights } from "./config.js";
import { openDb, recordPriceCheck } from "./db.js";
import { checkFlightPrice } from "./scraper.js";
import { sendPriceDropEmail, formatPriceDropEmail } from "./email.js";

const NOTIFY_TO = process.env.NOTIFY_EMAIL;

// Flights sharing a `group` (e.g. the two legs of a round trip) are booked
// and canceled together, so their combined cheapest fare — not each leg in
// isolation — is what determines whether cancel-and-rebook is worth it.
function groupFlights(flights) {
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

  for (const flight of flights) {
    try {
      const result = await checkFlightPrice(flight);
      results.set(flight.id, result);
      recordPriceCheck(db, {
        flightId: flight.id,
        cheapestPoints: result.cheapestPoints,
        fareBucket: result.fareBucket,
      });
      console.log(`${flight.id}: cheapest now ${result.cheapestPoints} pts (${result.fareBucket})`);
    } catch (err) {
      console.error(`Failed to check ${flight.id}:`, err.message);
    }
  }

  const drops = [];
  for (const legs of groupFlights(flights)) {
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
      await sendPriceDropEmail({ to: NOTIFY_TO, subject, body });
      console.log(`Sent alert email to ${NOTIFY_TO}: ${subject}`);
    }
  } else {
    console.log("No price drops above threshold.");
  }

  db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
