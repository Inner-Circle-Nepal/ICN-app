import { describe, expect, it, vi } from "vitest";

/** Investigations is hidden from every section list the app shows. */

const rows = [
  { id: "1", slug: "nepal", name: "Nepal", sort_order: 1 },
  { id: "2", slug: "investigations", name: "Investigations", sort_order: 2 },
  { id: "3", slug: "diaspora", name: "Diaspora", sort_order: 3 },
];

vi.mock("@/lib/api/supabase", () => ({
  getPublicSupabase: () => ({
    from: () => ({
      select: () => ({ order: async () => ({ data: rows, error: null }) }),
    }),
  }),
}));

import { getCategories, getCategoryBySlug } from "@/lib/api/queries";

describe("hidden sections", () => {
  it("leaves Investigations out of the category list", async () => {
    const list = await getCategories();
    expect(list.map((c) => c.slug)).toEqual(["nepal", "diaspora"]);
    expect(await getCategoryBySlug("investigations")).toBeNull();
  });
});
