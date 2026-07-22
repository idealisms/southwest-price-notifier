import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import https from "node:https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TOKEN_PATH = path.join(__dirname, "..", "token.json");

// token.json is a self-contained Python google-auth Credentials dump (token,
// refresh_token, client_id/secret, token_uri all in one file) rather than the
// split credentials.json + token.json shape from the Node googleapis
// quickstart — no separate credentials.json needed.
//
// This talks to Google directly over node:https rather than via the
// `googleapis` package: on this box, gaxios's bundled node-fetch reliably
// throws "Invalid response body ... Premature close" fetching a fresh access
// token, even though the refresh token itself is valid (confirmed with a raw
// https request) — some kind of stream/gzip handling bug in that dependency
// chain on this platform. Plain node:https doesn't hit it.
function httpsRequestJson(url, { method = "GET", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        let parsed;
        try {
          parsed = data ? JSON.parse(data) : {};
        } catch (err) {
          reject(new Error(`Non-JSON response (status ${res.statusCode}): ${data}`));
          return;
        }
        if (res.statusCode >= 400) {
          reject(new Error(`${url} responded ${res.statusCode}: ${JSON.stringify(parsed)}`));
          return;
        }
        resolve(parsed);
      });
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

async function getAccessToken(token) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: token.client_id,
    client_secret: token.client_secret,
    refresh_token: token.refresh_token,
  }).toString();

  const { access_token } = await httpsRequestJson(token.token_uri ?? "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
    body,
  });
  return access_token;
}

function buildRawMessage({ to, subject, body }) {
  const message = [`To: ${to}`, `Subject: ${subject}`, "Content-Type: text/plain; charset=UTF-8", "", body].join(
    "\n",
  );
  return Buffer.from(message).toString("base64url");
}

export async function sendEmail({ to, subject, body }) {
  const token = JSON.parse(readFileSync(TOKEN_PATH, "utf-8"));
  const accessToken = await getAccessToken(token);
  const raw = buildRawMessage({ to, subject, body });
  const payload = JSON.stringify({ raw });

  await httpsRequestJson("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload),
    },
    body: payload,
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
