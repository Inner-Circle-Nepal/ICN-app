-- ============================================================================
--  Mobile breaking-news push (iOS / Android app)
--
--  The website already sends Web Push to browsers (`push_subscriptions`).
--  This adds the app's equivalent, sent through Expo's push service:
--
--    mobile_push_tokens   one row per phone that turned alerts on
--    mobile_push_log      one row per article already alerted, so a story
--                         is never pushed twice however often it is edited
--
--  Phones never touch the table directly. Two SECURITY DEFINER functions are
--  the only door: a phone can add or remove ITS OWN token, and nobody using
--  the anon key can read the list. Only the service role (the Edge Function
--  `send-breaking-push`) reads it.
--
--  Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

create table if not exists public.mobile_push_tokens (
  token        text primary key
               check (token ~ '^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$'),
  platform     text not null check (platform in ('ios', 'android')),
  language     text not null default 'en' check (language in ('en', 'ne')),
  edition      text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.mobile_push_log (
  article_id  uuid primary key,
  sent_at     timestamptz not null default now(),
  recipients  integer not null default 0
);

alter table public.mobile_push_tokens enable row level security;
alter table public.mobile_push_log    enable row level security;
-- No policies on purpose: with RLS on and no policy, anon and authenticated
-- roles can neither read nor write. The functions below and the service role
-- are the only ways in.
revoke all on public.mobile_push_tokens from anon, authenticated;
revoke all on public.mobile_push_log    from anon, authenticated;

-- A phone registers (or refreshes) its own token.
create or replace function public.register_push_token(
  p_token    text,
  p_platform text,
  p_language text default 'en',
  p_edition  text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mobile_push_tokens (token, platform, language, edition)
  values (p_token, p_platform, coalesce(p_language, 'en'), p_edition)
  on conflict (token) do update
    set platform     = excluded.platform,
        language     = excluded.language,
        edition      = excluded.edition,
        last_seen_at = now();
end;
$$;

-- A phone that turns alerts off removes its own token. Knowing the token is
-- the proof of ownership; tokens are never readable through the anon key.
create or replace function public.unregister_push_token(p_token text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.mobile_push_tokens where token = p_token;
$$;

revoke all on function public.register_push_token(text, text, text, text) from public;
revoke all on function public.unregister_push_token(text) from public;
grant execute on function public.register_push_token(text, text, text, text) to anon, authenticated;
grant execute on function public.unregister_push_token(text) to anon, authenticated;
