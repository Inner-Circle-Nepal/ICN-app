-- ============================================================================
--  "All news" push: a phone can ask for every story, not only breaking ones.
--
--    mobile_push_tokens.all_news_enabled   per-phone opt-in, off by default
--    mobile_news_push_log                  dedupe for story pushes, one row
--                                          per article
--
--  The sender is still `send-breaking-push` (same webhook on `articles`). It
--  now sends to two audiences that never overlap:
--    - all_news_enabled: every newly published story, once (a breaking story
--      is styled as breaking). Claimed in mobile_news_push_log.
--    - breaking_enabled and not all_news_enabled: breaking stories only, as
--      before. Claimed in mobile_push_log.
--  So a phone with All news on never gets a second push for a breaking story.
--
--  Production: run once in the Supabase SQL editor BEFORE deploying the new
--  function. Safe to re-run.
-- ============================================================================

alter table public.mobile_push_tokens
  add column if not exists all_news_enabled boolean not null default false;

create table if not exists public.mobile_news_push_log (
  article_id  uuid primary key,
  sent_at     timestamptz not null default now(),
  recipients  integer not null default 0
);

alter table public.mobile_news_push_log enable row level security;
-- No policies on purpose: anon and authenticated cannot see this.
revoke all on public.mobile_news_push_log from anon, authenticated;

-- Every story already published counts as sent, so the next edit to an old
-- story doesn't push it to All news readers. (The sender also ignores stories
-- published more than a day ago.)
insert into public.mobile_news_push_log (article_id)
select id from public.articles where status = 'published'
on conflict do nothing;

-- Flip the all-news preference for a token the caller already holds. Same
-- shape as set_chautari_push_preference: knowing the token is the proof of
-- ownership, and the table is not readable through the anon key.
create or replace function public.set_all_news_push_preference(
  p_token   text,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mobile_push_tokens
     set all_news_enabled = p_enabled,
         last_seen_at     = now()
   where token = p_token;
end;
$$;

revoke all on function public.set_all_news_push_preference(text, boolean) from public;
grant execute on function public.set_all_news_push_preference(text, boolean) to anon, authenticated;
