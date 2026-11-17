import { getPublicSupabase } from "./supabase";
import type { ReaderProfile } from "./readerProfile";

/**
 * Find readers by @handle or name.
 *
 * Calls the `search_reader_profiles` RPC
 * (`supabase/migrations/20261118_reader_profile_search.sql`) with the anon
 * key: profiles are public, and going straight to Supabase saves the hop
 * through the site. The function does the ranking and caps the result, so the
 * app never pages or filters.
 */

/** Largest page the RPC will return, whatever is asked for. */
export const MAX_SEARCH_RESULTS = 20;

/** "  @Aksho " → "aksho". Empty when there is nothing to search for. */
export function normalizeQuery(raw: string): string {
  return raw.trim().replace(/^@+/, "").trim().toLowerCase();
}

function isProfileRow(row: unknown): row is ReaderProfile {
  if (!row || typeof row !== "object") return false;
  const r = row as Record<string, unknown>;
  return (
    typeof r.clerk_user_id === "string" &&
    typeof r.username === "string" &&
    typeof r.display_name === "string"
  );
}

export async function searchReaders(
  raw: string,
  { limit = 8, signal }: { limit?: number; signal?: AbortSignal } = {},
): Promise<ReaderProfile[]> {
  const q = normalizeQuery(raw);
  if (!q) return [];

  const sb = getPublicSupabase();
  if (!sb) return [];

  let request = sb.rpc("search_reader_profiles", {
    q,
    lim: Math.min(Math.max(Math.trunc(limit), 1), MAX_SEARCH_RESULTS),
  });
  if (signal) request = request.abortSignal(signal);

  const { data, error } = await request;
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data.filter(isProfileRow) : [];
}
