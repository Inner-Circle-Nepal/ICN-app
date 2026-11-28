import { afterEach, describe, expect, it, vi } from "vitest";

import { compareVersions, isOutdated } from "@/features/appUpdate/version";
import { getAppVersionInfo } from "@/lib/api/appVersion";

describe("app version check", () => {
  it("compares x.y.z numerically", () => {
    expect(compareVersions("1.3.4", "1.3.4")).toBe(0);
    expect(compareVersions("1.3.3", "1.3.4")).toBeLessThan(0);
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
    expect(compareVersions("2.0.0", "1.99.99")).toBeGreaterThan(0);
    expect(compareVersions("1.3", "1.3.4")).toBeNull();
  });

  it("is outdated only on a definite older version", () => {
    expect(isOutdated("1.3.3", "1.3.4")).toBe(true);
    expect(isOutdated("1.3.4", "1.3.4")).toBe(false);
    expect(isOutdated("1.4.0", "1.3.4")).toBe(false);
    expect(isOutdated("1.3.3", null)).toBe(false);
    expect(isOutdated(null, "1.3.4")).toBe(false);
    expect(isOutdated("garbage", "1.3.4")).toBe(false);
  });
});

describe("getAppVersionInfo", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads the site's answer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            minVersion: { android: "1.3.4", ios: null },
            storeUrl: { android: "https://play.example/a", ios: "https://apps.example/i" },
          }),
        ),
      ),
    );
    expect(await getAppVersionInfo()).toEqual({
      minVersion: { android: "1.3.4", ios: null },
      storeUrl: { android: "https://play.example/a", ios: "https://apps.example/i" },
    });
  });

  it("is null when the site is unreachable or says something else", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    expect(await getAppVersionInfo()).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 404 })));
    expect(await getAppVersionInfo()).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false }))));
    expect(await getAppVersionInfo()).toBeNull();
  });
});
