import { beforeEach, describe, expect, it, vi } from "vitest";

/** People search: input cleanup and the RPC client. */

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  abortSignal: vi.fn(),
  response: { data: [] as unknown, error: null as { message: string } | null },
}));

vi.mock("@/lib/api/supabase", () => ({
  getPublicSupabase: () => ({
    rpc: (name: string, args: unknown) => {
      mocks.rpc(name, args);
      const request = Promise.resolve(mocks.response) as Promise<unknown> & {
        abortSignal: (s: AbortSignal) => unknown;
      };
      request.abortSignal = (s) => {
        mocks.abortSignal(s);
        return request;
      };
      return request;
    },
  }),
}));

import { normalizeQuery, searchReaders } from "@/lib/api/readerSearch";

const row = (username: string) => ({
  clerk_user_id: `user_${username}`,
  username,
  display_name: username.toUpperCase(),
  bio: null,
  avatar_url: null,
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
});

beforeEach(() => {
  mocks.rpc.mockClear();
  mocks.abortSignal.mockClear();
  mocks.response = { data: [], error: null };
});

describe("normalizeQuery", () => {
  it("drops leading @ signs, spaces and case", () => {
    expect(normalizeQuery("  @Aksho ")).toBe("aksho");
    expect(normalizeQuery("@@a")).toBe("a");
    expect(normalizeQuery("@ ram")).toBe("ram");
  });

  it("is empty when only an @ was typed", () => {
    expect(normalizeQuery("@")).toBe("");
    expect(normalizeQuery("   ")).toBe("");
  });

  it("leaves Devanagari alone", () => {
    expect(normalizeQuery("राम")).toBe("राम");
  });
});

describe("searchReaders", () => {
  it("does not call the database for empty input", async () => {
    expect(await searchReaders("@")).toEqual([]);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends the cleaned term and a capped limit", async () => {
    await searchReaders("@A", { limit: 500 });
    expect(mocks.rpc).toHaveBeenCalledWith("search_reader_profiles", { q: "a", lim: 20 });
  });

  it("passes the abort signal through", async () => {
    const controller = new AbortController();
    await searchReaders("a", { signal: controller.signal });
    expect(mocks.abortSignal).toHaveBeenCalledWith(controller.signal);
  });

  it("keeps only well-formed rows", async () => {
    mocks.response = { data: [row("asha"), { username: 3 }, null], error: null };
    const found = await searchReaders("as");
    expect(found.map((p) => p.username)).toEqual(["asha"]);
  });

  it("throws on a database error so the screen can offer a retry", async () => {
    mocks.response = { data: null, error: { message: "boom" } };
    await expect(searchReaders("a")).rejects.toThrow("boom");
  });
});
