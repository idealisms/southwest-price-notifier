import { loadFlights } from "./config.js";
import { openDb, recordFlightPaidIfChanged } from "./db.js";

// Snapshots config/flights.json's points_paid into flight_paid_history
// without running a full scrape — for after editing flights.json (e.g. a
// rebook), so the dashboard picks up the new paid price and the savings
// calc has both endpoints, without waiting for the next scheduled scrape.
const flights = loadFlights();
const db = openDb();
for (const flight of flights) {
  recordFlightPaidIfChanged(db, { flightId: flight.id, pointsPaid: flight.points_paid });
}
db.close();
console.log(`Recorded config snapshot for ${flights.length} flight(s).`);
