import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  SUPABASE_ANON_KEY,
  SUPABASE_URL,
  isSupabaseConfigured,
} from "@/constants/config";

/**
 * Anonymous, session-free Supabase client for reading published content.
 *
 * Mirrors `site/src/lib/supabase/public.ts` with an explicit request timeout
 * so poor mobile network conditions fail fast and allow TanStack Query to
 * retry or serve cached data.
 */

let cachedClient: SupabaseClient | null = null;

const REQUEST_TIMEOUT_MS = 10_000;

/**
 * `fetch` that gives up after `REQUEST_TIMEOUT_MS`, and still honours a
 * caller's own abort.
 *
 * The timeout and the caller's signal are combined rather than chosen between.
 * Preferring `init.signal` when one was supplied — as this did — left the
 * timer running against a controller nothing was listening to, so every
 * request that carried a cancellation signal had no timeout at all. Those are
 * exactly the requests a screen cancels on navigation, which on a stalled
 * mobile connection is where hanging longest hurts most.
 */
function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const callerSignal = init?.signal;

  const timer = setTimeout(() => controller.abort(new Error("Request timed out")), REQUEST_TIMEOUT_MS);

  const forwardAbort = () => controller.abort(callerSignal?.reason);
  if (callerSignal) {
    if (callerSignal.aborted) forwardAbort();
    else callerSignal.addEventListener("abort", forwardAbort, { once: true });
  }

  return fetch(input, { ...init, signal: controller.signal }).finally(() => {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", forwardAbort);
  });
}

export function getPublicSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (cachedClient) return cachedClient;

  cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  });

  return cachedClient;
}
