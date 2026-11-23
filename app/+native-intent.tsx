import { systemLinkTarget } from "@/utils/deepLinks";

/**
 * Expo Router's hook for every link the operating system opens the app with:
 * the launch link and links arriving while it runs. Android hands the app
 * icn.news links once they are verified (assetlinks.json on the site); which
 * paths it claims is the intent filter in app.json.
 *
 * The decision is `systemLinkTarget` in src/utils/deepLinks.ts. A path the
 * app can't read is passed on unchanged and lands on app/+not-found.tsx.
 *
 * Runs outside the app's React tree and must never throw (Expo: a throw here
 * can crash the app), so any surprise falls back to the original path.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }) {
  try {
    const target = systemLinkTarget(path);
    return target.kind === "route" ? target.path : path;
  } catch {
    return path;
  }
}
