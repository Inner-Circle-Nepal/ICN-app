-- Reminders: a periodic nudge to come back to the newsroom.
--
-- Scheduled by pg_cron (see docs/revision) three times a week; the Edge
-- Function `send-reminder-push` selects every phone with
-- `reminders_enabled = true` and sends one message picked from a shared
-- pool indexed by day-of-year (so a given device sees the same message
-- on the same day no matter when the cron fires).
--
-- Dedupe: `reminder_push_log.sent_on` is a date PK, so a second cron
-- firing on the same NPT day fails the insert and the function exits.

alter table public.mobile_push_tokens
  add column if not exists reminders_enabled boolean not null default false;

create table if not exists public.reminder_push_log (
  sent_on     date primary key,
  sent_at     timestamptz not null default now(),
  recipients  integer not null default 0
);

alter table public.reminder_push_log enable row level security;
revoke all on public.reminder_push_log from anon, authenticated;

create or replace function public.set_reminder_push_preference(
  p_token   text,
  p_enabled boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.mobile_push_tokens
     set reminders_enabled = p_enabled,
         last_seen_at      = now()
   where token = p_token;
end;
$$;

revoke all on function public.set_reminder_push_preference(text, boolean) from public;
grant execute on function public.set_reminder_push_preference(text, boolean) to anon, authenticated;
