-- ============================================================================
--  INNER CIRCLE NEPAL — Chautari listening log
-- ============================================================================
--  Copy of the site repo's supabase/2026-11-chautari-listen-log.sql, so the local
--  stack (npx supabase db reset) has it. Production applies the site
--  file by hand in the SQL editor.
--  Idempotent: safe to re-run.
--
--  `chautari_participants` keeps one row per person per room and every rejoin
--  overwrites it, so earlier listening is lost. This log keeps one row per
--  LiveKit connection (participant sid), filled from LiveKit's webhook, so
--  listening time can be measured later (host rewards, qualified minutes).
--  Nothing reads it yet; there is no scoring here, only facts.
--
--  `chautari_join_context` holds what the app said about itself when it last
--  asked to join a room (install id, platform, version, phone region). The
--  token route writes it; the webhook copies it onto the session at join.
--  None of it goes into LiveKit metadata, which every listener can read.
--
--  Server-only: RLS on, no policies, functions not executable by anon or
--  authenticated.
-- ============================================================================

create table if not exists public.chautari_join_context (
  room_id       uuid not null references public.chautari_rooms(id) on delete cascade,
  clerk_user_id text not null,
  install_id    text,                -- random per install, not a hardware id
  platform      text,                -- 'ios' | 'android' | 'web'
  app_version   text,
  device_region text,                -- phone's region setting, 2 letters
  country       text,                -- from the IP address; not filled yet
  at            timestamptz not null default now(),
  primary key (room_id, clerk_user_id)
);

create table if not exists public.chautari_listen_sessions (
  id              uuid primary key default gen_random_uuid(),
  participant_sid text not null unique,              -- LiveKit's id for one connection
  room_id         uuid not null references public.chautari_rooms(id) on delete cascade,
  host_clerk_id   text not null,
  clerk_user_id   text not null,
  role_at_join    text,
  /* Either can be null for a while: LiveKit may deliver `left` before
     `joined`. Times are LiveKit's, not when the webhook arrived. */
  joined_at       timestamptz,
  left_at         timestamptz,
  install_id      text,
  platform        text,
  app_version     text,
  device_region   text,
  country         text,
  created_at      timestamptz not null default now()
);

create index if not exists chautari_listen_sessions_room
  on public.chautari_listen_sessions (room_id, joined_at);
create index if not exists chautari_listen_sessions_listener
  on public.chautari_listen_sessions (clerk_user_id, joined_at desc);
create index if not exists chautari_listen_sessions_host
  on public.chautari_listen_sessions (host_clerk_id, joined_at desc);
create index if not exists chautari_listen_sessions_open
  on public.chautari_listen_sessions (room_id)
  where left_at is null;

alter table public.chautari_join_context    enable row level security;
alter table public.chautari_listen_sessions enable row level security;


-- ----------------------------------------------------------------------------
--  Webhook helpers. Each one sets values rather than toggling, so a repeated
--  or out-of-order event changes nothing it shouldn't.
-- ----------------------------------------------------------------------------

create or replace function public.chautari_session_joined(
  p_sid       text,
  p_room_id   uuid,
  p_clerk_id  text,
  p_at        timestamptz
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into public.chautari_listen_sessions (
    participant_sid, room_id, host_clerk_id, clerk_user_id, role_at_join, joined_at,
    install_id, platform, app_version, device_region, country
  )
  select
    p_sid, r.id, r.host_clerk_id, p_clerk_id, p.role, p_at,
    c.install_id, c.platform, c.app_version, c.device_region, c.country
  from public.chautari_rooms r
  left join public.chautari_participants p
    on p.room_id = r.id and p.clerk_user_id = p_clerk_id
  left join public.chautari_join_context c
    on c.room_id = r.id and c.clerk_user_id = p_clerk_id
  where r.id = p_room_id
  on conflict (participant_sid) do update set
    joined_at     = coalesce(public.chautari_listen_sessions.joined_at, excluded.joined_at),
    role_at_join  = coalesce(public.chautari_listen_sessions.role_at_join, excluded.role_at_join),
    install_id    = coalesce(public.chautari_listen_sessions.install_id, excluded.install_id),
    platform      = coalesce(public.chautari_listen_sessions.platform, excluded.platform),
    app_version   = coalesce(public.chautari_listen_sessions.app_version, excluded.app_version),
    device_region = coalesce(public.chautari_listen_sessions.device_region, excluded.device_region),
    country       = coalesce(public.chautari_listen_sessions.country, excluded.country);
end;
$$;

create or replace function public.chautari_session_left(
  p_sid       text,
  p_room_id   uuid,
  p_clerk_id  text,
  p_at        timestamptz
)
returns void
language plpgsql
set search_path = public, pg_temp
as $$
begin
  insert into public.chautari_listen_sessions (
    participant_sid, room_id, host_clerk_id, clerk_user_id, left_at
  )
  select p_sid, r.id, r.host_clerk_id, p_clerk_id, p_at
  from public.chautari_rooms r
  where r.id = p_room_id
  on conflict (participant_sid) do update set
    left_at = coalesce(public.chautari_listen_sessions.left_at, excluded.left_at);
end;
$$;

-- The room closed: anyone still open left now.
create or replace function public.chautari_sessions_close_room(
  p_room_id uuid,
  p_at      timestamptz
)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.chautari_listen_sessions
     set left_at = p_at
   where room_id = p_room_id
     and left_at is null;
$$;

revoke all on function public.chautari_session_joined(text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.chautari_session_left(text, uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.chautari_sessions_close_room(uuid, timestamptz) from public, anon, authenticated;

grant execute on function public.chautari_session_joined(text, uuid, text, timestamptz) to service_role;
grant execute on function public.chautari_session_left(text, uuid, text, timestamptz) to service_role;
grant execute on function public.chautari_sessions_close_room(uuid, timestamptz) to service_role;
