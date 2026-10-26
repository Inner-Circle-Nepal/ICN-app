/**
 * Turning a picked image into something Clerk will accept.
 *
 * Its own module, free of any `react-native` or `expo-*` import, so it can be
 * tested under vitest's node environment — the same reason
 * `features/chautari/initials.ts` exists.
 *
 * `SetProfileImageParams.file` is `Blob | File | string | null`. React Native
 * has no `File`, and building a `Blob` means round-tripping the image through
 * `fetch`, so the string form — a base64 data URI — is the one that avoids a
 * whole class of RN-specific upload bugs.
 */

/** The shape we need from `ImagePicker`'s asset, without importing its types. */
export interface PickedImage {
  base64?: string | null;
  mimeType?: string | null;
}

/**
 * JPEG, because that is what a phone camera roll overwhelmingly holds and
 * what the picker re-encodes to when `quality` is set. Only used when the
 * platform declines to report a type at all — the docs note `mimeType` "may
 * be null if it can't be determined".
 */
const FALLBACK_MIME = "image/jpeg";

/** Image types Clerk accepts for a profile picture. */
const ALLOWED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

/**
 * Build the data URI, or `null` when there is nothing usable to send.
 *
 * Returning `null` rather than throwing keeps the caller's error handling in
 * one place: the screen already has to explain a failed upload, and an
 * unreadable pick is the same sentence to the reader.
 */
export function profileImageDataUri(asset: PickedImage | null | undefined): string | null {
  const base64 = asset?.base64;
  if (!base64) return null;

  /*
   * A reported type can carry parameters (`image/jpeg; charset=binary`) and
   * case varies by platform, so it is normalised before being trusted — an
   * unrecognised type falls back rather than being passed through, because a
   * data URI whose declared type does not match its bytes is rejected at the
   * far end with a message nobody can act on.
   */
  const reported = (asset?.mimeType ?? "").split(";")[0].trim().toLowerCase();
  const mime = ALLOWED.has(reported) ? reported : FALLBACK_MIME;

  return `data:${mime};base64,${base64}`;
}
