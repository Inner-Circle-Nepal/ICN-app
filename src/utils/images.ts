import { SUPABASE_URL } from "@/constants/config";

/**
 * Right-sized image delivery for story photography.
 *
 * Every hero is stored at full editorial resolution in Supabase Storage, and
 * the app was asking for that original everywhere — including the 88×66pt
 * thumbnail on a wire row. Measured across twelve live heroes the originals
 * average 140 KB and run to 607 KB, which is the single largest thing the app
 * puts on a phone's data connection.
 *
 * Supabase's render endpoint resizes server-side and is enabled on this
 * project (verified against the live bucket). Asking it for the width actually
 * drawn cuts those same twelve images by 78% at thumbnail width and 52% at
 * hero width.
 *
 * Only this project's own storage URLs are rewritten. Some stories carry a
 * hero from a wire service or an image host (`i.guim.co.uk`, `ibb.co`), and
 * those are returned untouched — the render endpoint cannot resize what it
 * does not store, and rewriting them would break the image.
 */

const STORAGE_OBJECT_PATH = "/storage/v1/object/public/";
const STORAGE_RENDER_PATH = "/storage/v1/render/image/public/";

/** Widths requested from the renderer; one of a few values so the CDN caches well. */
export const IMAGE_WIDTHS = {
  /** 88×66pt wire-row thumbnail. */
  thumb: 400,
  /** Full-bleed card or related-story image. */
  card: 800,
  /** Full-bleed article hero and inline figures. */
  hero: 1080,
} as const;

export type ImageWidth = (typeof IMAGE_WIDTHS)[keyof typeof IMAGE_WIDTHS];

function storageHost(): string | null {
  try {
    return SUPABASE_URL ? new URL(SUPABASE_URL).host.toLowerCase() : null;
  } catch {
    return null;
  }
}

/**
 * Returns `url` resized to `width`, or `url` unchanged when it is not a
 * Supabase Storage object this project can transform.
 */
export function sizedImageUrl(
  url: string | null | undefined,
  width: ImageWidth,
  quality = 70,
): string | undefined {
  if (!url) return undefined;

  const host = storageHost();
  if (!host) return url;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }

  if (parsed.host.toLowerCase() !== host) return url;
  if (!parsed.pathname.startsWith(STORAGE_OBJECT_PATH)) return url;

  // An already-transformed URL keeps whatever the caller asked for.
  if (parsed.pathname.startsWith(STORAGE_RENDER_PATH)) return url;

  parsed.pathname = parsed.pathname.replace(STORAGE_OBJECT_PATH, STORAGE_RENDER_PATH);
  parsed.searchParams.set("width", String(width));
  parsed.searchParams.set("quality", String(quality));
  return parsed.toString();
}
