-- Copy of the site repo's supabase/2026-11-chautari-live-list.sql for the local stack.
-- Production gets the site file, run by hand in the SQL editor.

-- ============================================================================
--  INNER CIRCLE NEPAL — Chautari room list in real time
-- ============================================================================
--  Run once in the Supabase SQL editor, after 2026-10-chautari.sql.
--  Idempotent: safe to re-run.
--
--  When a room is created or its status changes (scheduled → live → ended,
--  however it happens: the host, LiveKit's room_finished webhook, a
--  suspension), broadcast { slug, status } on the public Realtime channel
--  `chautari-rooms`, event `room_status`. The app's Chautari tab listens and
--  refetches /api/chautari/discover at once instead of waiting for its poll.
--
--  A broadcast rather than Realtime's row changes: those are filtered by RLS,
--  and the public may read only scheduled and live rooms, so the change that
--  matters most (a room ending) would never reach the app.
--
--  The payload is only the slug and the new status, both public already.
--  Realtime failing must never stop a room starting or ending, hence the
--  exception handler.
-- ============================================================================

create or replace function public.chautari_rooms_broadcast_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    begin
      perform realtime.send(
        jsonb_build_object('slug', new.slug, 'status', new.status),
        'room_status',
        'chautari-rooms',
        false
      );
    exception when others then
      raise warning 'chautari room broadcast failed: %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

drop trigger if exists chautari_rooms_broadcast_status on public.chautari_rooms;
create trigger chautari_rooms_broadcast_status
  after insert or update of status on public.chautari_rooms
  for each row execute function public.chautari_rooms_broadcast_status();
