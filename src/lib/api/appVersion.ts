import { SITE_URL } from "@/constants/config";

/** What the site says about supported app versions (`GET /api/app/version`). */
export interface AppVersionInfo {
  minVersion: { android: string | null; ios: string | null };
  storeUrl: { android: string; ios: string };
}

const TIMEOUT_MS = 8000;

function str(v: unknown): string | null {
  return typeof v === "string" && v ? v : null;
}

/**
 * Null when the site can't be reached or answers something unexpected: the
 * app then carries on as normal (see src/features/appUpdate/version.ts).
 */
export async function getAppVersionInfo(): Promise<AppVersionInfo | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${SITE_URL}/api/app/version`, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      ok?: unknown;
      minVersion?: Record<string, unknown>;
      storeUrl?: Record<string, unknown>;
    };
    if (body.ok !== true) return null;
    return {
      minVersion: { android: str(body.minVersion?.android), ios: str(body.minVersion?.ios) },
      storeUrl: {
        android: str(body.storeUrl?.android) ?? "https://play.google.com/store/apps/details?id=news.icn.mobile",
        ios: str(body.storeUrl?.ios) ?? "https://apps.apple.com/app/id6828508148",
      },
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
