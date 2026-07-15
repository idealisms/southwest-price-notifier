import { loadFlights } from "./config.js";
import { openDb, recordPriceCheck } from "./db.js";
import { checkFlightPrice } from "./scraper.js";
import { sendPriceDropEmail, formatPriceDropEmail } from "./email.js";

const NOTIFY_TO = process.env.NOTIFY_EMAIL;

async function main() {
  const flights = loadFlights();
  const db = openDb();
  const drops = [];

  for (const flight of flights) {
    let result;
    try {
      result = await checkFlightPrice(flight);
    } catch (err) {
      console.error(`Failed to check ${flight.id}:`, err.message);
      continue;
    }

    recordPriceCheck(db, {
      flightId: flight.id,
      cheapestPoints: result.cheapestPoints,
      fareBucket: result.fareBucket,
    });

    const drop = flight.points_paid - result.cheapestPoints;
    console.log(`${flight.id}: paid ${flight.points_paid}, now ${result.cheapestPoints} (drop ${drop})`);

    if (drop >= flight.notify_threshold_points) {
      drops.push({
        origin: flight.origin,
        destination: flight.destination,
        date: flight.date,
        pointsPaid: flight.points_paid,
        cheapestPoints: result.cheapestPoints,
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
