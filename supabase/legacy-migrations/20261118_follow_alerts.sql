-- ============================================================================
--  Chautari alerts from the people you follow.
--
--  Replaces "every room, for everyone who opted in". After following someone
--  the app asks whether to be told about their Chautari rooms; a yes sets
--  `notify` on that follow. `send-chautari-live-push` then alerts, when a
--  room goes live, the host's followers with `notify` on, on phones linked
--  to them (`mobile_push_tokens.clerk_user_id`) with Chautari alerts on.
--  Invitations to a room reach a reader only from someone they follow with
--  `notify` on, so the same switch on a profile silences both.
--
--  Written only by the site (`PATCH /api/reader/follows/[username]`) with
--  the service role, like the rest of `user_follows`.
--
--  Run once in the Supabase SQL editor, after 20261118_push_accounts.sql.
--  Safe to re-run.
-- ============================================================================

alter table public.user_follows
  add column if not exists notify boolean not null default false;

-- "Who wants to hear about this host": the lookup made when a room goes live.
create index if not exists user_follows_notify_followee_idx
  on public.user_follows (followee_clerk_id)
  where notify;
