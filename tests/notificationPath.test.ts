import { describe, expect, it } from "vitest";
import type { NotificationResponse } from "expo-notifications";

import { extractNotificationPath } from "@/lib/notifications/path";

/**
 * Deep-link extraction for tapped push payloads.
 *
 * The four branches matter because this is the single point of contact
 * between the push server's payload shape and the router: a regression
 * here sends readers to the home feed when they tapped a breaking-news
 * alert, with no error anywhere to show something went wrong.
 */

function response(data: Record<string, unknown> | null): NotificationResponse {
  // Only the data path is exercised; the rest of NotificationResponse is
  // built structurally so the type check passes without faking the whole
  // native shape.
  return {
    notification: {
      request: {
        content: { data } as never,
        identifier: "x",
        trigger: null,
      },
      date: 0,
    },
    actionIdentifier: "",
  } as unknown as NotificationResponse;
}

describe("extractNotificationPath", () => {
  it("returns `path` when the payload names one directly", () => {
    expect(extractNotificationPath(response({ path: "/article/foo-bar" }))).toBe(
      "/article/foo-bar",
    );
  });

  it("builds an /article/ path from a bare slug (legacy payloads)", () => {
    expect(extractNotificationPath(response({ slug: "nepal-budget-2026" }))).toBe(
      "/article/nepal-budget-2026",
    );
  });

  it("falls through to `url` when no path or slug is present", () => {
    expect(extractNotificationPath(response({ url: "/chautari/weekly-roundup" }))).toBe(
      "/chautari/weekly-roundup",
    );
  });

  it("prefers `path` over `slug` and `url` when more than one is present", () => {
    expect(
      extractNotificationPath(
        response({ path: "/preferred", slug: "ignored", url: "/also-ignored" }),
      ),
    ).toBe("/preferred");
  });

  it("prefers `slug` over `url` when `path` is absent", () => {
    expect(extractNotificationPath(response({ slug: "s", url: "/u" }))).toBe(
      "/article/s",
    );
  });

  it("trims whitespace the payload may carry", () => {
    expect(extractNotificationPath(response({ path: "  /article/x  " }))).toBe(
      "/article/x",
    );
  });

  it("treats an empty or whitespace-only field as absent", () => {
    expect(extractNotificationPath(response({ path: "   ", slug: "fallback" }))).toBe(
      "/article/fallback",
    );
  });

  it("returns null when the payload holds no routable field", () => {
    expect(extractNotificationPath(response({ title: "no path here" }))).toBeNull();
  });

  it("returns null when the payload has no data at all", () => {
    expect(extractNotificationPath(response(null))).toBeNull();
  });

  it("returns null when the response itself is null (cold-launch, no tap)", () => {
    expect(extractNotificationPath(null)).toBeNull();
  });

  it("ignores non-string path values rather than crashing", () => {
    expect(
      extractNotificationPath(response({ path: 42 as unknown as string })),
    ).toBeNull();
  });
});
