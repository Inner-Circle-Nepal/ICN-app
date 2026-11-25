-- Copy of the site repo's supabase/2026-11-chautari-invite-only.sql for the local stack.
-- Production gets the site file, run by hand in the SQL editor.

-- ============================================================================
--  Chautari: invite-only rooms and asking to join
--
--  A room can be invite only. It still appears in the room list (with a
--  lock), but joining needs one of: being the host, a moderator, invited
--  (a `chautari_invites` row), let in after asking (an approved row below),
--  or having been in the room before (a `chautari_participants` row, so a
--  dropped connection never has to ask again). The site decides this in
--  `decideAccess` (src/lib/chautari/authorize.ts).
--
--  `members_can_invite`: when on, anyone in the room may invite their own
--  followers (those with alerts on, as for every invite); when off, only the
--  host and moderators can.
--
--  `chautari_join_requests`: one row per person per room. The host or a
--  moderator approves or declines it; someone declined may ask again after a
--  short wait (the site enforces it from `decided_at`).
--
--  Service role only, like every Chautari table. Run once in the Supabase SQL
--  editor before deploying the site that uses it. Safe to re-run.
-- ============================================================================

alter table public.chautari_rooms
  add column if not exists invite_only boolean not null default false,
  add column if not exists members_can_invite boolean not null default false;

create table if not exists public.chautari_join_requests (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.chautari_rooms (id) on delete cascade,
  clerk_user_id text not null,
  status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'declined')),
  created_at    timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    text,
  unique (room_id, clerk_user_id)
);

-- The host's list: a room's pending requests, oldest first.
create index if not exists chautari_join_requests_pending_idx
  on public.chautari_join_requests (room_id, created_at)
  where status = 'pending';

alter table public.chautari_join_requests enable row level security;
revoke all on public.chautari_join_requests from anon, authenticated;
