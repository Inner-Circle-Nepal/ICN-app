import fs from "node:fs";
import path from "node:path";

/**
 * Loads `mobile/.env` into `process.env` before any test module is imported.
 *
 * Metro inlines `EXPO_PUBLIC_*` at build time, so in the app `constants/config`
 * reads real values the moment it is loaded. Under vitest nothing does that,
 * and because the config captures the values at module scope, it has to happen
 * before the first import — which is what a setup file guarantees and an
 * in-test loader does not.
 *
 * Nothing here fails when `.env` is missing: the suite then runs against an
 * unconfigured client, which is exactly what a fresh checkout looks like.
 */
const envPath = path.resolve(import.meta.dirname, "../.env");

if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
