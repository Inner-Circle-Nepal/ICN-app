import type { Edition } from "@/types/domain";

/**
 * Site identity and diaspora edition configuration.
 *
 * Mirrors `site/src/lib/site.ts` from the website codebase.
 */

const rawSiteUrl = process.env.EXPO_PUBLIC_SITE_URL || "https://icn.news";

export const site = {
  name: "Inner Circle Nepal",
  shortName: "ICN",
  tagline: "Beyond the Headlines.",
  description:
    "Independent news, analysis and essential guidance for Nepalis living and working abroad — from Kathmandu politics to visa rules, remittance rates and community life.",
  url: rawSiteUrl.replace(/\/$/, ""),
  locale: "en_US",
  founded: "2024",
  email: "newsroom@icn.news",
  contactEmail: "newsroom@icn.news",
  tipsEmail: "tips@icn.news",
  correctionsEmail: "corrections@icn.news",
  location: "Kathmandu · Diaspora",
  issn: "ISSN Pending",
  social: {
    facebook: "https://facebook.com/innercirclenepal",
    instagram: "https://instagram.com/innercirclenepal",
    youtube: "https://youtube.com/@innercirclenepal",
    tiktok: "https://tiktok.com/@innercirclenepal",
  },
  address: {
    locality: "Kathmandu",
    region: "Bagmati",
    country: "NP",
  },
} as const;

export function absoluteUrl(path = "/"): string {
  return `${site.url}${path.startsWith("/") ? path : `/${path}`}`;
}

export const editions: Edition[] = [
  {
    slug: "usa",
    name: "United States",
    code: "US",
    timezone: "America/New_York",
    currency: "USD",
    zones: [
      { label: "East Coast", tz: "America/New_York" },
      { label: "Central", tz: "America/Chicago" },
      { label: "Mountain", tz: "America/Denver" },
      { label: "Arizona", tz: "America/Phoenix" },
      { label: "Pacific", tz: "America/Los_Angeles" },
      { label: "Alaska", tz: "America/Anchorage" },
      { label: "Hawaii", tz: "Pacific/Honolulu" },
    ],
  },
];

export const retiredEditionSlugs = [
  "australia",
  "uk",
  "gulf",
  "japan",
  "south-korea",
  "canada",
  "malaysia",
] as const;

export const hasMultipleEditions = editions.length > 1;

export const editionBySlug = new Map(editions.map((e) => [e.slug, e]));

const zoneToEdition = new Map<string, string>();
for (const e of editions) {
  for (const z of e.zones) {
    if (!zoneToEdition.has(z.tz)) {
      zoneToEdition.set(z.tz, e.slug);
    }
  }
}

export function editionForTimezone(tz: string | null | undefined): Edition | null {
  if (!tz) return null;
  const slug = zoneToEdition.get(tz);
  return slug ? (editionBySlug.get(slug) ?? null) : null;
}

export function zoneIn(edition: Edition, tz: string | null | undefined) {
  if (!tz) return null;
  return edition.zones.find((z) => z.tz === tz) ?? null;
}
