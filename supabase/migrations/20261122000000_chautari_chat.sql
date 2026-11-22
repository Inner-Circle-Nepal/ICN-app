-- ============================================================================
--  INNER CIRCLE NEPAL — Chautari live chat
-- ============================================================================
--  Copy of the site repo's supabase/2026-11-chautari-chat.sql, so the local
--  stack (npx supabase db reset) has the table. Production applies the site
--  file by hand in the SQL editor.
--  Idempotent: safe to re-run.
--
--  One row per chat message in a room. Written only by the server
--  (/api/chautari/chat, service role), which checks the writer is signed in
--  and currently in the room, then pushes the message to the room over
--  LiveKit. RLS is on with no policies, so the anon key reads nothing.
--
--  Deleting is soft: `deleted_at` hides a message from history and the server
--  tells every open app to drop it. The row stays for moderation review.
-- ============================================================================

create table if not exists public.chautari_messages (
  id            uuid primary key default gen_random_uuid(),
  room_id       uuid not null references public.chautari_rooms(id) on delete cascade,
  clerk_user_id text not null,
  display_name  text,
  avatar_url    text,
  role          text not null default 'listener'
                check (role in ('host', 'moderator', 'speaker', 'listener')),
  body          text not null check (char_length(body) between 1 and 300),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  deleted_by    text
);

-- History for a room, newest first, skipping deleted messages.
create index if not exists chautari_messages_room_recent
  on public.chautari_messages (room_id, created_at desc)
  where deleted_at is null;

-- Everything one person wrote, for moderation.
create index if not exists chautari_messages_author
  on public.chautari_messages (clerk_user_id, created_at desc);

alter table public.chautari_messages enable row level security;
