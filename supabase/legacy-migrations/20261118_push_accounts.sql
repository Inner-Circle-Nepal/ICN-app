-- ============================================================================
--  Push tokens that know whose phone they are on, and a breaking-news opt-in
--  of their own.
--
--  Until now a row in `mobile_push_tokens` meant "this phone wants breaking
--  news", and nothing tied it to a reader. Alerts about people (someone you
--  follow went live, someone invited you to a room) need to reach one
--  reader's phones, and a reader who only wants those must not be signed up
--  for breaking news as a side effect. So:
--
--    clerk_user_id     who is signed in on this phone. Set and cleared by the
--                      site (`/api/reader/push-token`) after checking the
--                      Clerk session: the anon key cannot prove who it is.
--    breaking_enabled  the breaking-news opt-in. Existing rows were all made
--                      by turning breaking news on, so they start true.
--
--  `chautari_enabled` keeps its column but now means "Chautari alerts at
--  all": the master switch over alerts from the people you follow.
--
--  Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

alter table public.mobile_push_tokens
  add column if not exists clerk_user_id text
    check (clerk_user_id is null or clerk_user_id ~ '^user_'),
  add column if not exists breaking_enabled boolean not null default true;

create index if not exists mobile_push_tokens_clerk_user_idx
  on public.mobile_push_tokens (clerk_user_id)
  where clerk_user_id is not null;

-- Registration now says whether this phone wants breaking news. Left null by
-- an older app build, which keeps whatever the row already had (true for a
-- new row, since those builds only registered to get breaking news).
drop function if exists public.register_push_token(text, text, text, text);
create or replace function public.register_push_token(
  p_token    text,
  p_platform text,
  p_language text default 'en',
  p_edition  text default null,
  p_breaking boolean default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.mobile_push_tokens (token, platform, language, edition, breaking_enabled)
  values (p_token, p_platform, coalesce(p_language, 'en'), p_edition, coalesce(p_breaking, true))
  on conflict (token) do update
    set platform         = excluded.platform,
        language         = excluded.language,
        edition          = excluded.edition,
        breaking_enabled = coalesce(p_breaking, public.mobile_push_tokens.breaking_enabled),
        last_seen_at     = now();
end;
$$;

revoke all on function public.register_push_token(text, text, text, text, boolean) from public;
grant execute on function public.register_push_token(text, text, text, text, boolean) to anon, authenticated;

create or replace function public.set_breaking_push_preference(
  p_token   text,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mobile_push_tokens
     set breaking_enabled = p_enabled,
         last_seen_at     = now()
   where token = p_token;
end;
$$;

revoke all on function public.set_breaking_push_preference(text, boolean) from public;
grant execute on function public.set_breaking_push_preference(text, boolean) to anon, authenticated;
