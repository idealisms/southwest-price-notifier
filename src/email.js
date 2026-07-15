import { google } from "googleapis";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, "..", "token.json");

// token.json is a self-contained Python google-auth Credentials dump (token,
// refresh_token, client_id/secret, token_uri all in one file) rather than the
// split credentials.json + token.json shape from the Node googleapis
// quickstart — no separate credentials.json needed.
function getGmailClient() {
  const token = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));

  const oAuth2Client = new google.auth.OAuth2(token.client_id, token.client_secret);
  oAuth2Client.setCredentials({
    access_token: token.token,
    refresh_token: token.refresh_token,
    expiry_date: new Date(token.expiry).getTime(),
  });

  return google.gmail({ version: "v1", auth: oAuth2Client });
}

function buildRawMessage({ to, subject, body }) {
  const message = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", body].join(
    "\n",
  );
  return Buffer.from(message).toString("base64url");
}

export async function sendEmail({ to, subject, body }) {
  const gmail = getGmailClient();
  const raw = buildRawMessage({ to, subject, body });
  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw },
  });
}

export function formatPriceDropEmail(drops) {
  const totalSaved = drops.reduce((sum, d) => sum + (d.pointsPaid - d.cheapestPoints), 0);
  const subject = `Southwest price drop: ${totalSaved.toLocaleString()} pts`;

  const body = drops
    .map((d) => {
      const saved = d.pointsPaid - d.cheapestPoints;
      const routeLines = d.legs.map((leg) => `${leg.origin} -> ${leg.destination} (${leg.date})`).join("\n  ");
      return [
        routeLines,
        `  Paid: ${d.pointsPaid.toLocaleString()} pts | Now: ${d.cheapestPoints.toLocaleString()} pts | Save: ${saved.toLocaleString()} pts`,
      ].join("\n");
    })
    .join("\n\n");

  return { subject, body };
}

export function formatErrorEmail(errors) {
  const subject = `Southwest tracker error: ${errors.length} flight(s) failed to check`;
  const body = errors.map((e) => `${e.flightId}: ${e.message}`).join("\n\n");
  return { subject, body };
}
