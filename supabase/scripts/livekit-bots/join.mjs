#!/usr/bin/env node
/**
 * Connect bot readers to a room on the LOCAL LiveKit as listeners, so the
 * room shows people for visual checks. They stay until Ctrl-C.
 *
 *   node join.mjs <livekit room> <env file>  < bots.tsv
 *
 * bots.tsv: one bot per line, "<clerk id>\t<display name>\t<username>\t<avatar url or empty>".
 * Each gets a token shaped like the site's (src/lib/chautari/livekit.ts
 * mintJoinToken): identity = Clerk id, name, metadata { username, avatar },
 * listener grant. Credentials come from the site's .env.development.local
 * (never printed); anything that isn't a LiveKit on this machine is refused.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { Room } from "@livekit/rtc-node";

const [room, envFile] = process.argv.slice(2);
if (!room || !envFile) {
  console.error("usage: join.mjs <livekit room> <env file> < bots.tsv");
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
if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(url.replace(/^ws/, "http")).hostname)) {
  console.error("Refusing: LIVEKIT_URL is not local.");
  process.exit(1);
}

const b64u = (v) => Buffer.from(v).toString("base64url");
function listenerToken({ identity, name, username, avatar }) {
  const now = Math.floor(Date.now() / 1000);
  const meta = {};
  if (avatar) meta.avatar = avatar;
  if (username) meta.username = username;
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const claims = b64u(
    JSON.stringify({
      iss: key,
      sub: identity,
      name,
      metadata: JSON.stringify(meta),
      nbf: now,
      exp: now + 6 * 3600,
      video: { room, roomJoin: true, canPublish: false, canSubscribe: true, canPublishData: false },
    }),
  );
  return `${head}.${claims}.${createHmac("sha256", secret).update(`${head}.${claims}`).digest("base64url")}`;
}

const bots = readFileSync(0, "utf8")
  .split("\n")
  .filter(Boolean)
  .map((line) => {
    const [identity, name, username, avatar] = line.split("\t");
    return { identity, name, username, avatar };
  });

const rooms = [];
for (const bot of bots) {
  const r = new Room();
  try {
    await r.connect(url, listenerToken(bot), { autoSubscribe: false, dynacast: false });
    rooms.push(r);
    console.log(`joined: ${bot.name}`);
  } catch (error) {
    console.error(`${bot.name} couldn't join: ${error?.message ?? error}`);
  }
}
if (rooms.length === 0) process.exit(1);
console.log("In the room. Press Ctrl-C to make them leave.");

const leave = async () => {
  await Promise.allSettled(rooms.map((r) => r.disconnect()));
  process.exit(0);
};
process.on("SIGINT", leave);
process.on("SIGTERM", leave);
