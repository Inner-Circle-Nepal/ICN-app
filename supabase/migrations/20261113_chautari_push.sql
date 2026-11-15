-- ============================================================================
--  Chautari "live now" push — add-on to the mobile push schema
--
--  Separate opt-in from breaking news: a reader who wants only the daily
--  breaking stories, not every live chautari, can keep chautari off.
--
--    mobile_push_tokens.chautari_enabled   per-phone preference
--    chautari_push_log                     dedupe, one row per room
--
--  The sender is the Edge Function `send-chautari-live-push`, triggered by a
--  Database Webhook on `public.chautari_rooms` (INSERT, UPDATE).
--
--  Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

alter table public.mobile_push_tokens
  add column if not exists chautari_enabled boolean not null default false;

create table if not exists public.chautari_push_log (
  room_id     uuid primary key,
  sent_at     timestamptz not null default now(),
  recipients  integer not null default 0
);

alter table public.chautari_push_log enable row level security;
-- No policies on purpose: anon and authenticated cannot see this.
revoke all on public.chautari_push_log from anon, authenticated;

-- Flip the chautari preference for a token the caller already holds.
-- Knowing the token is the proof of ownership; the table is not readable
-- through the anon key, so this cannot be used to enumerate other phones.
create or replace function public.set_chautari_push_preference(
  p_token   text,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mobile_push_tokens
     set chautari_enabled = p_enabled,
         last_seen_at     = now()
   where token = p_token;
end;
$$;

revoke all on function public.set_chautari_push_preference(text, boolean) from public;
grant execute on function public.set_chautari_push_preference(text, boolean) to anon, authenticated;
