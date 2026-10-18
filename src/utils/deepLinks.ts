import { site } from "@/constants/site";

/**
 * Deep-link and canonical website URL resolution.
 *
 * Translates website URLs (e.g. `https://icn.news/immigration/canada-pnp-draw-...`)
 * or custom scheme links (`icn://article/slug`) into in-app Expo Router paths,
 * while distinguishing external links that should open in the system browser.
 */

const RESERVED_TOP_SEGMENTS = new Set([
  "admin",
  "api",
  "about",
  "account",
  "authors",
  "contact",
  "editions",
  "newsletter",
  "privacy",
  "search",
  "sign-in",
  "sign-up",
  "subscribe",
  "tag",
  "terms",
  "bookmarks",
  "explore",
  "settings",
  "article",
  "category",
]);

export type ResolvedDeepLink =
  | { type: "home" }
  | { type: "article"; slug: string; category?: string }
  | { type: "category"; slug: string }
  | { type: "search"; query?: string }
  | { type: "bookmarks" }
  | { type: "settings" }
  | { type: "explore" }
  | { type: "external"; url: string };

const KNOWN_HOSTS = new Set([
  "icn.news",
  "www.icn.news",
  "innercirclenepal.com",
  "www.innercirclenepal.com",
]);

try {
  const configuredHost = new URL(site.url).hostname.toLowerCase();
  if (configuredHost) KNOWN_HOSTS.add(configuredHost);
} catch {
  // Ignore invalid URL in env
}

export function resolveDeepLink(rawUrl: string): ResolvedDeepLink | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Handle relative paths (e.g. "/nepal/some-story" or "/immigration")
  if (trimmed.startsWith("/")) {
    return resolvePathAndQuery(trimmed);
  }

  // Handle custom app scheme: icn://...
  if (trimmed.startsWith("icn://")) {
    const withoutScheme = trimmed.slice("icn://".length);
    return resolvePathAndQuery(`/${withoutScheme.replace(/^\/+/, "")}`);
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  const host = parsed.hostname.toLowerCase();
  if (!KNOWN_HOSTS.has(host)) {
    return { type: "external", url: trimmed };
  }

  return resolvePathAndQuery(`${parsed.pathname}${parsed.search}`);
}

function resolvePathAndQuery(pathWithQuery: string): ResolvedDeepLink {
  const [rawPath, rawSearch = ""] = pathWithQuery.split("?");
  const segments = rawPath
    .split("/")
    .map((s) => decodeURIComponent(s.trim()))
    .filter(Boolean);

  if (segments.length === 0) {
    return { type: "home" };
  }

  const [first, second, third] = segments;

  if (first === "search") {
    const params = new URLSearchParams(rawSearch);
    const q = params.get("q")?.trim() || undefined;
    return { type: "search", query: q };
  }

  if (first === "bookmarks") return { type: "bookmarks" };
  if (first === "settings" || first === "about" || first === "contact" || first === "newsletter") {
    return { type: "settings" };
  }
  if (first === "explore") return { type: "explore" };

  if (first === "article" && second) {
    return { type: "article", slug: second };
  }

  if (first === "category" && second) {
    return { type: "category", slug: second };
  }

  // Website pagination: `/{category}/page/{n}`
  if (second === "page" && third && !RESERVED_TOP_SEGMENTS.has(first)) {
    return { type: "category", slug: first };
  }

  // Canonical website article path: `/{category}/{slug}`
  if (segments.length === 2 && !RESERVED_TOP_SEGMENTS.has(first) && second) {
    return { type: "article", category: first, slug: second };
  }

  // Canonical website section path: `/{category}`
  if (segments.length === 1 && !RESERVED_TOP_SEGMENTS.has(first)) {
    return { type: "category", slug: first };
  }

  return { type: "external", url: `${site.url}${pathWithQuery.startsWith("/") ? "" : "/"}${pathWithQuery}` };
}

/** Converts a resolved deep link into an Expo Router path string. */
export function deepLinkToRouterPath(resolved: ResolvedDeepLink): string | null {
  switch (resolved.type) {
    case "home":
      return "/";
    case "article":
      return `/article/${encodeURIComponent(resolved.slug)}`;
    case "category":
      return `/category/${encodeURIComponent(resolved.slug)}`;
    case "search":
      return resolved.query
        ? `/search?q=${encodeURIComponent(resolved.query)}`
        : "/search";
    case "bookmarks":
      return "/bookmarks";
    case "settings":
      return "/settings";
    case "explore":
      return "/explore";
    case "external":
      return null;
  }
}
