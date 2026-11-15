import type * as NotificationsNS from "expo-notifications";

/**
 * Extracts a target path or slug from a notification payload when tapped.
 *
 * Kept in its own file (rather than co-located in `push.ts`) so it stays
 * importable from tests: `push.ts` reaches `react-native`, whose Flow-
 * typed source Vitest cannot parse. This function has no RN dependencies —
 * only the type of the response, which `import type` erases at runtime.
 *
 * Shape mirrors `PushPayload` in `site/src/lib/push/server.ts`:
 *   `{ path, title, body, tag }` — plus two legacy shorthands (`slug`,
 *   `url`) kept because older breaking-news payloads used them.
 */
export function extractNotificationPath(
  response: NotificationsNS.NotificationResponse | null,
): string | null {
  const data = response?.notification?.request?.content?.data as
    | Record<string, unknown>
    | undefined;
  if (!data) return null;

  if (typeof data.path === "string" && data.path.trim()) {
    return data.path.trim();
  }
  if (typeof data.slug === "string" && data.slug.trim()) {
    return `/article/${data.slug.trim()}`;
  }
  if (typeof data.url === "string" && data.url.trim()) {
    return data.url.trim();
  }
  return null;
}
