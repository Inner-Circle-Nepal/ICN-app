import * as WebBrowser from "expo-web-browser";

import { systemLinkTarget } from "@/utils/deepLinks";

/**
 * Expo Router's hook for every link the operating system opens the app with:
 * the launch link (`initial`) and links arriving while it runs. Android hands
 * the app icn.news links once they are verified (assetlinks.json on the site);
 * which paths it claims is the intent filter in app.json.
 *
 * The decision is `systemLinkTarget` in src/utils/deepLinks.ts. A page the app
 * doesn't have opens in a browser tab rather than through the system: handing
 * an icn.news URL back to Android could route it straight back here.
 *
 * Runs outside the app's React tree and must never throw (Expo: a throw here
 * can crash the app), so any surprise falls back to the original path.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }) {
  try {
    const target = systemLinkTarget(path);
    if (target.kind === "route") return target.path;
    if (target.kind === "browser") {
      void WebBrowser.openBrowserAsync(target.url).catch(() => {});
      // Launched by the link: start on the front page. Already open: stay put.
      return initial ? "/" : null;
    }
    return path;
  } catch {
    return path;
  }
}
