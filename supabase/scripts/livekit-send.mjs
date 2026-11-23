#!/usr/bin/env node
/**
 * Push one data packet into a room on the LOCAL LiveKit server, the way the
 * site's sendToRoom (src/lib/chautari/livekit.ts) does: RoomService.SendData,
 * reliable, on a topic. Used by bots.sh for chat and applause.
 *
 *   node livekit-send.mjs <livekit room> <topic> <env file>  < packet.json
 *
 * Credentials come from the site's .env.development.local (never printed).
 * Anything that isn't a LiveKit on this machine is refused, so this cannot
 * reach production.
 */
import { createHmac, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";

const [room, topic, envFile] = process.argv.slice(2);
if (!room || !topic || !envFile) {
  console.error("usage: livekit-send.mjs <room> <topic> <env file> < packet.json");
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

// A short-lived admin token for this one room, as the server SDK makes.
const b64u = (v) => Buffer.from(v).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
const claims = b64u(
  JSON.stringify({ video: { roomAdmin: true, room }, iss: key, nbf: now, exp: now + 60 }),
);
const sig = createHmac("sha256", secret).update(`${head}.${claims}`).digest("base64url");

const packet = readFileSync(0, "utf8").trim();
const res = await fetch(new URL("/twirp/livekit.RoomService/SendData", base), {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${head}.${claims}.${sig}`,
  },
  body: JSON.stringify({
    room,
    data: Buffer.from(packet).toString("base64"),
    kind: "RELIABLE",
    destinationSids: [],
    topic,
    nonce: randomBytes(16).toString("base64"),
  }),
});

if (!res.ok) {
  const text = await res.text().catch(() => "");
  console.error(`LiveKit refused (${res.status}): ${text.slice(0, 200)}`);
  if (res.status === 404) console.error("Nobody has joined the room yet, so LiveKit hasn't created it.");
  process.exit(1);
}
