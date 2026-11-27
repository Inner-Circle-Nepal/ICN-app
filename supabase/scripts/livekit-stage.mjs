#!/usr/bin/env node
/**
 * Let a reader speak in a room on the LOCAL LiveKit server, or send them back
 * to listening, the way the site's moderate route (approve_speaker /
 * demote_speaker) does: RoomService.UpdateParticipant with the publish
 * permission, the raised hand cleared. bots.sh updates the database role first.
 *
 *   node livekit-stage.mjs <livekit room> <clerk id> <on|off> <env file>
 *
 * Credentials come from the site's .env.development.local (never printed).
 * Anything that isn't a LiveKit on this machine is refused.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

const [room, identity, onOff, envFile] = process.argv.slice(2);
if (!room || !identity || !["on", "off"].includes(onOff) || !envFile) {
  console.error("usage: livekit-stage.mjs <room> <clerk id> <on|off> <env file>");
  process.exit(2);
}

const env = {};
for (const line of readFileSync(envFile, "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, "$2");
}
const { LIVEKIT_URL: url, LIVEKIT_API_KEY: key, LIVEKIT_API_SECRET: secret } = env;
if (!url || !key || !secret) {
  console.error(`LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET missing in ${envFile}`);
  process.exit(1);
}
const base = new URL(url.replace(/^ws/, "http"));
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  console.error(`Refusing: LIVEKIT_URL is not local (${base.hostname}).`);
  process.exit(1);
}

const b64u = (v) => Buffer.from(v).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const claims = b64u(
  JSON.stringify({ video: { roomAdmin: true, room }, iss: key, nbf: now, exp: now + 60 }),
);
const sig = createHmac("sha256", secret).update(`${head}.${claims}`).digest("base64url");

const speak = onOff === "on";
const res = await fetch(new URL("/twirp/livekit.RoomService/UpdateParticipant", base), {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${head}.${claims}.${sig}` },
  body: JSON.stringify({
    room,
    identity,
    permission: {
      canPublish: speak,
      canSubscribe: true,
      canPublishData: speak,
      // As the site: a speaker may publish a microphone and nothing else.
      canPublishSources: speak ? ["MICROPHONE"] : [],
    },
    attributes: { hand: "" },
  }),
});
if (!res.ok) {
  const text = await res.text().catch(() => "");
  console.error(`LiveKit refused (${res.status}): ${text.slice(0, 200)}`);
  if (res.status === 404) console.error("That reader isn't in the room right now.");
  process.exit(1);
}
