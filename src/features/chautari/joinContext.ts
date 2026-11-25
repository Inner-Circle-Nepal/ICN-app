import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";
import Constants from "expo-constants";

import { getInstallId } from "@/lib/storage/installId";

/**
 * What the app says about itself when it asks to join a room: install id,
 * platform, app version and the phone's region setting. Stored by the
 * server for the listening log, never shown to the room. See the site's
 * src/lib/chautari/joinContext.ts for how it is checked.
 *
 * The region comes from the phone's Region setting through
 * expo-localization. A development build made before the module was added
 * has no native side for it, and in development Metro reports a module that
 * fails to load as a fatal error even inside try/catch, so the native module
 * is looked up first and the JS is only loaded when it exists. Without it,
 * no region is sent.
 */

type Localization = typeof import("expo-localization");

function deviceRegion(): string | null {
  if (!requireOptionalNativeModule("ExpoLocalization")) return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const loc = require("expo-localization") as Localization;
    const region = loc.getLocales()[0]?.regionCode ?? null;
    return region && /^[A-Za-z]{2}$/.test(region) ? region.toUpperCase() : null;
  } catch {
    return null;
  }
}

export async function joinContextHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "x-icn-platform": Platform.OS };
  const installId = await getInstallId();
  if (installId) headers["x-icn-install-id"] = installId;
  const version = Constants.expoConfig?.version;
  if (version) headers["x-icn-app-version"] = version;
  const region = deviceRegion();
  if (region) headers["x-icn-region"] = region;
  return headers;
}
