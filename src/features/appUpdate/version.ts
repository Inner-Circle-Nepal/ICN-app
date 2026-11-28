/**
 * Is this copy of the app older than the oldest one we still support?
 *
 * The site answers `GET /api/app/version` with a minimum per platform (set in
 * the droplet's `.env`, see the site's `src/lib/app/minVersion.ts`). React-free
 * so it can be tested. Anything unreadable counts as "not outdated": the
 * check must never lock a reader out by mistake.
 */

function parts(v: string): number[] | null {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative if a < b, 0 if equal, positive if a > b; null if either is unreadable. */
export function compareVersions(a: string, b: string): number | null {
  const pa = parts(a);
  const pb = parts(b);
  if (!pa || !pb) return null;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

export function isOutdated(installed: string | null | undefined, min: string | null | undefined): boolean {
  if (!installed || !min) return false;
  const c = compareVersions(installed, min);
  return c !== null && c < 0;
}
