#!/usr/bin/env node
/**
 * One bot joins a room on the LOCAL LiveKit as a speaker: it plays a looping
 * melody with no gaps (so a phone that stops playing room audio is obvious by
 * ear), and it listens to everyone else, printing each speaker's level once a
 * second (so a phone whose microphone stops sending shows as "silent").
 * It stays until Ctrl-C.
 *
 * Caveat (2026-11-27): the melody reaches the room, but between two bots on
 * this laptop the meter received no audio frames at all (the bots' receiving
 * connection seems not to get through the local LiveKit's TCP-only setup), so
 * a "silent" line proves nothing until the meter has been seen working.
 *
 *   node speak.mjs <livekit room> <env file>  < bot.tsv
 *
 * bot.tsv: one line, "<clerk id>\t<display name>\t<username>\t<avatar url or empty>",
 * as for join.mjs. The token is minted here with a publish grant; credentials
 * come from the site's .env.development.local (never printed) and anything
 * that isn't a LiveKit on this machine is refused.
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  Room,
  RoomEvent,
  TrackKind,
  TrackPublishOptions,
  TrackSource,
} from "@livekit/rtc-node";

const [room, envFile] = process.argv.slice(2);
if (!room || !envFile) {
  console.error("usage: speak.mjs <livekit room> <env file> < bot.tsv");
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
function speakerToken({ identity, name, username, avatar }) {
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
      video: { room, roomJoin: true, canPublish: true, canSubscribe: true, canPublishData: false },
    }),
  );
  return `${head}.${claims}.${createHmac("sha256", secret).update(`${head}.${claims}`).digest("base64url")}`;
}

const [identity, name, username, avatar] = readFileSync(0, "utf8").split("\n")[0].split("\t");
const bot = { identity, name, username, avatar };

const RATE = 48000;
const FRAME = RATE / 100; // 10 ms frames, as WebRTC expects
// C major arpeggio, a quarter second per note, looping: never silent, easy to follow.
const NOTES = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63];
const NOTE_SAMPLES = RATE / 4;

const r = new Room();
try {
  await r.connect(url, speakerToken(bot), { autoSubscribe: true, dynacast: false });
} catch (error) {
  console.error(`${bot.name} couldn't join: ${error?.message ?? error}`);
  process.exit(1);
}

const source = new AudioSource(RATE, 1);
const track = LocalAudioTrack.createAudioTrack("bot-melody", source);
await r.localParticipant.publishTrack(
  track,
  new TrackPublishOptions({ source: TrackSource.SOURCE_MICROPHONE }),
);
console.log(`${bot.name} is speaking (a looping melody). Press Ctrl-C to leave.`);

let stopped = false;
let n = 0;
(async () => {
  while (!stopped) {
    const data = new Int16Array(FRAME);
    for (let i = 0; i < FRAME; i++, n++) {
      const freq = NOTES[Math.floor(n / NOTE_SAMPLES) % NOTES.length];
      const t = n / RATE;
      data[i] = Math.round(Math.sin(2 * Math.PI * freq * t) * 6000);
    }
    // captureFrame paces itself against its queue, so this loop runs in real time.
    await source.captureFrame(new AudioFrame(data, RATE, 1, FRAME));
  }
})();

// What everyone else sends: one line a second per speaker.
const levels = new Map(); // name -> { sum, count }
r.on(RoomEvent.TrackSubscribed, (remote, _pub, participant) => {
  if (remote.kind !== TrackKind.KIND_AUDIO) return;
  const who = participant.name || participant.identity;
  console.log(`hearing ${who}`);
  levels.set(who, { sum: 0, count: 0 });
  (async () => {
    const stream = new AudioStream(remote);
    for await (const frame of stream) {
      const l = levels.get(who);
      if (!l) break;
      for (const s of frame.data) l.sum += s * s;
      l.count += frame.data.length;
    }
  })().catch((e) => console.error("receive failed:", e?.message ?? e));
});
r.on(RoomEvent.TrackUnsubscribed, (_t, _p, participant) => {
  const who = participant.name || participant.identity;
  if (levels.delete(who)) console.log(`stopped hearing ${who} (track gone)`);
});

const clock = () => new Date().toTimeString().slice(0, 8);
const meter = setInterval(() => {
  for (const [who, l] of levels) {
    const rms = l.count ? Math.sqrt(l.sum / l.count) : 0;
    const db = rms > 0 ? 20 * Math.log10(rms / 32768) : -Infinity;
    const label = db < -60 ? "silent" : `${db.toFixed(0)} dBFS ${"▇".repeat(Math.max(1, Math.round((db + 60) / 5)))}`;
    console.log(`${clock()}  ${who}: ${label}`);
    l.sum = 0;
    l.count = 0;
  }
}, 1000);

const leave = async () => {
  stopped = true;
  clearInterval(meter);
  await r.disconnect().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", leave);
process.on("SIGTERM", leave);
