import { describe, expect, it } from "vitest";
import { deepLinkToRouterPath, resolveDeepLink, systemLinkTarget } from "@/utils/deepLinks";

describe("deepLinks", () => {
  it("resolves canonical website article URLs to in-app article routes", () => {
    const resolved = resolveDeepLink(
      "https://icn.news/nepal/rsp-municipal-candidate-club-applications-open",
    );
    expect(resolved).toEqual({
      type: "article",
      category: "nepal",
      slug: "rsp-municipal-candidate-club-applications-open",
    });
    expect(resolved && deepLinkToRouterPath(resolved)).toBe(
      "/article/rsp-municipal-candidate-club-applications-open",
    );
  });

  it("resolves category URLs on icn.news to category routes", () => {
    const resolved = resolveDeepLink("https://www.icn.news/diaspora");
    expect(resolved).toEqual({
      type: "category",
      slug: "diaspora",
    });
    expect(resolved && deepLinkToRouterPath(resolved)).toBe("/category/diaspora");
  });

  it("resolves custom scheme icn:// URLs", () => {
    const resolved = resolveDeepLink("icn://article/nepal-remittance-report");
    expect(resolved).toEqual({
      type: "article",
      slug: "nepal-remittance-report",
    });
    expect(resolved && deepLinkToRouterPath(resolved)).toBe(
      "/article/nepal-remittance-report",
    );
  });

  it("marks non-ICN domains as external", () => {
    const resolved = resolveDeepLink("https://www.nrb.org.np/forex");
    expect(resolved).toEqual({
      type: "external",
      url: "https://www.nrb.org.np/forex",
    });
    expect(resolved && deepLinkToRouterPath(resolved)).toBeNull();
  });

  it("opens Chautari rooms from push paths and website links", () => {
    // The exact `path` send-chautari-live-push and send-chautari-invite-push send.
    const fromPush = resolveDeepLink("/chautari/morning-markets-967ns");
    expect(fromPush).toEqual({ type: "chautari", slug: "morning-markets-967ns" });
    expect(fromPush && deepLinkToRouterPath(fromPush)).toBe("/chautari/morning-markets-967ns");

    const fromSite = resolveDeepLink("https://icn.news/chautari/morning-markets-967ns");
    expect(fromSite && deepLinkToRouterPath(fromSite)).toBe("/chautari/morning-markets-967ns");

    const tab = resolveDeepLink("https://icn.news/chautari");
    expect(tab && deepLinkToRouterPath(tab)).toBe("/chautari");
  });

  describe("systemLinkTarget (links the OS opens the app with)", () => {
    it("routes shared stories and rooms to their screens", () => {
      expect(systemLinkTarget("https://icn.news/nepse/hydropower-ipo-rules")).toEqual({
        kind: "route",
        path: "/article/hydropower-ipo-rules",
      });
      expect(systemLinkTarget("https://icn.news/chautari/link-test-u9zln")).toEqual({
        kind: "route",
        path: "/chautari/link-test-u9zln",
      });
    });

    it("leaves paths the app can't read unchanged, for the not-found screen", () => {
      expect(systemLinkTarget("https://icn.news/nepal/not/a-story")).toEqual({
        kind: "route",
        path: "/nepal/not/a-story",
      });
      expect(systemLinkTarget("https://icn.news/privacy?x=1")).toEqual({
        kind: "route",
        path: "/privacy",
      });
    });

    it("leaves app-scheme, dev-client and other-domain links to Expo Router", () => {
      expect(systemLinkTarget("icn://chautari/abc")).toEqual({ kind: "passthrough" });
      expect(
        systemLinkTarget("exp+inner-circle-nepal://expo-development-client/?url=http%3A%2F%2F10.0.0.2%3A8081"),
      ).toEqual({ kind: "passthrough" });
      expect(systemLinkTarget("https://example.com/nepal/story")).toEqual({ kind: "passthrough" });
      expect(systemLinkTarget("/chautari/abc")).toEqual({ kind: "passthrough" });
    });
  });
});
