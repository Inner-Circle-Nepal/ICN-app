-- ============================================================================
--  INNER CIRCLE NEPAL — rate limiting for public endpoints
-- ============================================================================
--  Copy of the site repo's supabase/2026-10-rate-limits.sql, so the local
--  stack (npx supabase db reset) has it. Production applies the site
--  file by hand in the SQL editor.
--
--  What this is for
--  ----------------
--  Five routes accept writes from anyone on the internet with no session:
--
--    /api/newsletter          sends a confirmation email to any address given
--    /api/contact             writes a row and notifies the desk
--    /api/track               writes an analytics event
--    /api/ads/impression      increments an advertiser-facing counter
--    /api/ads/click           increments an advertiser-facing counter
--
--  The newsletter one is the dangerous one. It takes an address and mails it
--  through Resend, so unthrottled it is a free email-bombing service pointed
--  at our own sending domain — and the cost is not the bill, it is the sender
--  reputation the weekday briefing now depends on entirely. The two ad routes
--  are next: those numbers are what advertisers are shown, and anyone able to
--  inflate them at will makes the whole placement report worthless.
--
--  Why Postgres and not memory
--  ---------------------------
--  A counter in process memory is per-instance, and serverless means an
--  attacker gets a fresh allowance with every cold start — which is to say no
--  allowance at all. This table is the one piece of shared state every
--  instance already has a connection to, and the same unique-key-claim trick
--  that makes `newsletter_sends.send_key` safe against a double-fired cron
--  makes this safe against concurrent requests.
--
--  Accuracy note: this is a FIXED WINDOW, not a sliding one. Someone can send
--  `limit` requests at the end of one window and `limit` again at the start of
--  the next. That is a known and accepted property — the point is to put a
--  ceiling on sustained abuse, not to police the exact shape of a burst, and a
--  sliding window costs a row per request instead of a row per window.
-- ============================================================================

create table if not exists public.rate_limits (
  /** "<bucket>:<subject>:<window start epoch>" — one row per window. */
  key         text primary key,

  /** Requests seen in this window. */
  count       integer not null default 0,

  /**
   * When this row stops being interesting. Kept as a column rather than
   * derived from the key so the cleanup below is a plain index scan.
   */
  expires_at  timestamptz not null,

  created_at  timestamptz not null default now()
);

create index if not exists rate_limits_expires_idx
  on public.rate_limits (expires_at);

-- ----------------------------------------------------------------------------
--  RLS: nobody reaches this table directly.
-- ----------------------------------------------------------------------------
--  There is no policy for anon or authenticated, by design — the only way in
--  is the security-definer function below, which returns a decision and never
--  the contents. A readable rate-limit table tells an attacker exactly how
--  much allowance they have left.

alter table public.rate_limits enable row level security;

-- ----------------------------------------------------------------------------
--  The one entry point.
-- ----------------------------------------------------------------------------
--  Returns the number of requests counted in the current window INCLUDING
--  this one, so the caller compares against its own limit and does not have to
--  trust the client about anything.
--
--  `security definer` because the table has no policies; `search_path` pinned
--  because a definer function that resolves names through the caller's
--  search_path can be pointed at an attacker's table of the same name.
--
--  The insert-then-increment is a single statement so two concurrent requests
--  cannot both read 0 and both write 1. The primary key is what serialises
--  them: the loser's insert conflicts and takes the update branch.

create or replace function public.bump_rate_limit(
  p_bucket   text,
  p_subject  text,
  p_window_s integer
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window_start bigint;
  v_key          text;
  v_count        integer;
begin
  if p_window_s is null or p_window_s < 1 or p_window_s > 86400 then
    raise exception 'window must be between 1 and 86400 seconds';
  end if;

  -- Floor the clock to the window, so every request in the same window agrees
  -- on the same key without any coordination.
  v_window_start := (extract(epoch from now())::bigint / p_window_s) * p_window_s;
  v_key := p_bucket || ':' || p_subject || ':' || v_window_start;

  insert into public.rate_limits (key, count, expires_at)
  values (
    v_key,
    1,
    to_timestamp(v_window_start + p_window_s * 2)
  )
  on conflict (key) do update
    set count = public.rate_limits.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

-- Callable by the public site (anon) and by staff sessions. Not by the public
-- at large in any other form — there is no select grant on the table itself.
grant execute on function public.bump_rate_limit(text, text, integer)
  to anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
--  Cleanup.
-- ----------------------------------------------------------------------------
--  Expired rows are dead weight. This is called opportunistically from the
--  limiter in application code (one in roughly every two hundred requests),
--  which is cheaper than a scheduled job and keeps the table from growing
--  without bound. `expires_at` is twice the window, so a row is only ever
--  deleted well after the window it belongs to has closed.

create or replace function public.prune_rate_limits()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  delete from public.rate_limits where expires_at < now();
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.prune_rate_limits() to anon, authenticated, service_role;
