/**
 * Client-side mirrors of the validators in
 * `site/src/lib/reader/profile.ts`. Keep these in sync: the server is the
 * authority, but running the same checks on the client lets the UI block a
 * clearly-invalid value before a round trip, and show a useful inline error.
 *
 * The regex is the same one the Postgres check constraint enforces, so a
 * value that passes here will also pass the DB — any 422 we see at runtime
 * is therefore a server-only rule (e.g. a reserved word) rather than a
 * client/server drift.
 */

export const USERNAME_PATTERN = /^[a-z0-9_]{3,30}$/;

export const RESERVED_USERNAMES: ReadonlySet<string> = new Set([
  "admin",
  "root",
  "settings",
  "chautari",
  "moderator",
  "mod",
  "help",
  "about",
  "you",
  "me",
  "support",
  "icn",
  "api",
  "www",
  "null",
  "undefined",
]);

export type FieldCheck =
  | { ok: true }
  | { ok: false; message: string };

export function validateUsername(input: string): FieldCheck {
  const value = input.trim();
  if (value.length === 0) {
    return { ok: false, message: "Pick a username." };
  }
  if (!USERNAME_PATTERN.test(value)) {
    return {
      ok: false,
      message: "3–30 characters: lowercase letters, numbers, and underscores only.",
    };
  }
  if (RESERVED_USERNAMES.has(value)) {
    return { ok: false, message: "That username is reserved." };
  }
  return { ok: true };
}

/**
 * Trim + collapse internal whitespace. Mirrors `normalizeDisplayName` on the
 * server — the DB check runs `char_length(btrim(display_name))`, so trailing
 * spaces that look okay in a text field would otherwise fail server-side
 * only.
 */
export function normalizeDisplayName(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function validateDisplayName(input: string): FieldCheck {
  const value = normalizeDisplayName(input);
  if (value.length === 0) {
    return { ok: false, message: "Your name must not be empty." };
  }
  if (value.length > 60) {
    return { ok: false, message: "Max 60 characters." };
  }
  return { ok: true };
}

export function validateBio(input: string): FieldCheck {
  if (input.length > 240) {
    return { ok: false, message: "Max 240 characters." };
  }
  return { ok: true };
}
