import { describe, expect, it } from "vitest";
import { deepLinkToRouterPath, resolveDeepLink } from "@/utils/deepLinks";

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
});
