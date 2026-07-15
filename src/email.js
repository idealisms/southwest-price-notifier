import { google } from "googleapis";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, "..", "token.json");
const CREDENTIALS_PATH = path.join(__dirname, "..", "credentials.json");

function getGmailClient() {
  const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, "utf-8"));
  const token = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
  const { client_secret, client_id, redirect_uris } = credentials.installed ?? credentials.web;

  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);
  oAuth2Client.setCredentials(token);

  return google.gmail({ version: "v1", auth: oAuth2Client });
}

function buildRawMessage({ to, subject, body }) {
  const message = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", body].join(
    "\n",
  );
  return Buffer.from(message).toString("base64url");
}

export async function sendPriceDropEmail({ to, subject, body }) {
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
      return [
        `${d.origin} -> ${d.destination} (${d.date}, conf ${d.confirmationNumber})`,
        `  Paid: ${d.pointsPaid.toLocaleString()} pts | Now: ${d.cheapestPoints.toLocaleString()} pts | Save: ${saved.toLocaleString()} pts`,
      ].join("\n");
    })
    .join("\n\n");

  return { subject, body };
}
