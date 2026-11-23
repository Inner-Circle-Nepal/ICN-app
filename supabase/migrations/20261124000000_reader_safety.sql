-- Copy of the site repo's supabase/2026-11-reader-safety.sql for the local stack.
-- Production gets the site file, run by hand in the SQL editor.

-- ============================================================================
--  INNER CIRCLE NEPAL — reader reports and suspensions
-- ============================================================================
--  Run once in the Supabase SQL editor, after admin-schema.sql (has_cap),
--  the reader profiles migration and 2026-11-chautari-chat.sql.
--  Idempotent: safe to re-run.
--
--  reader_reports      One row per report: a reader's (POST /api/reader/report)
--                      or the word filter's. Context is copied in at report
--                      time (usernames, room title, the message and when it
--                      was sent), so the evidence survives a deleted message,
--                      an ended room or a renamed profile.
--  reader_suspensions  One row per reader ever suspended, keyed by Clerk id
--                      (a reader without a profile can be suspended too).
--                      Active while lifted_at is null.
--
--  Both are written by the server with the service role and reviewed in the
--  newsroom admin (/admin/reports) by staff holding `reports:review`, which
--  the policies below check. The anon key reads nothing.
--
--  A suspended reader's profile disappears from public reads, including the
--  app's people search (search_reader_profiles runs with the caller's rights).
-- ============================================================================

/* ---------------------------------------------------------------- reports */

create table if not exists public.reader_reports (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz not null default now(),

  -- 'reader': someone pressed Report. 'filter': the word filter refused a text.
  source              text not null check (source in ('reader', 'filter')),
  reason              text not null
                      check (reason in ('abuse', 'harassment', 'spam', 'other', 'blocked_words')),
  -- The reader's "anything to add", or the filter's matched words.
  details             text check (char_length(details) <= 1000),

  -- What was reported.
  context             text not null
                      check (context in ('chautari_person', 'chautari_message', 'chautari_room', 'profile')),

  reporter_clerk_id   text,
  reporter_username   text,
  reporter_name       text,

  reported_clerk_id   text not null,
  reported_username   text,
  reported_name       text,

  room_id             uuid references public.chautari_rooms(id) on delete set null,
  room_slug           text,
  room_title          text,
  message_id          uuid references public.chautari_messages(id) on delete set null,
  message_text        text,
  message_sent_at     timestamptz,

  -- The reviewer's decision.
  status              text not null default 'open'
                      check (status in ('open', 'dismissed', 'actioned')),
  reviewed_at         timestamptz,
  reviewed_by         text,
  review_note         text
);

create index if not exists reader_reports_open
  on public.reader_reports (created_at desc) where status = 'open';
create index if not exists reader_reports_reported
  on public.reader_reports (reported_clerk_id, created_at desc);
create index if not exists reader_reports_reporter
  on public.reader_reports (reporter_clerk_id, created_at desc);

alter table public.reader_reports enable row level security;

drop policy if exists "review reports" on public.reader_reports;
create policy "review reports" on public.reader_reports
  for select using (public.has_cap('reports:review'));

drop policy if exists "decide reports" on public.reader_reports;
create policy "decide reports" on public.reader_reports
  for update using (public.has_cap('reports:review'))
  with check (public.has_cap('reports:review'));

/* ------------------------------------------------------------ suspensions */

create table if not exists public.reader_suspensions (
  clerk_user_id  text primary key,
  -- Copied in at suspension time, for the admin list.
  username       text,
  display_name   text,
  -- Shown to the reader whenever an action is refused.
  reason         text not null check (char_length(reason) between 1 and 500),
  suspended_at   timestamptz not null default now(),
  suspended_by   text,
  lifted_at      timestamptz,
  lifted_by      text
);

create index if not exists reader_suspensions_active
  on public.reader_suspensions (suspended_at desc) where lifted_at is null;

alter table public.reader_suspensions enable row level security;

drop policy if exists "review suspensions" on public.reader_suspensions;
create policy "review suspensions" on public.reader_suspensions
  for select using (public.has_cap('reports:review'));

drop policy if exists "suspend readers" on public.reader_suspensions;
create policy "suspend readers" on public.reader_suspensions
  for insert with check (public.has_cap('reports:review'));

drop policy if exists "change suspensions" on public.reader_suspensions;
create policy "change suspensions" on public.reader_suspensions
  for update using (public.has_cap('reports:review'))
  with check (public.has_cap('reports:review'));

/*
 * Whether a reader is suspended right now. SECURITY DEFINER so the public
 * profile policy below can ask without the anon role being able to read the
 * suspensions table itself.
 */
create or replace function public.is_reader_suspended(uid text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.reader_suspensions s
     where s.clerk_user_id = uid and s.lifted_at is null
  );
$$;

revoke all on function public.is_reader_suspended(text) from public;
grant execute on function public.is_reader_suspended(text) to anon, authenticated;

/* ------------------------------------ hide suspended readers from the public */

-- Replaces the open policy from the reader profiles migration. Staff who
-- review reports still see everyone.
drop policy if exists reader_profiles_public_read on public.reader_profiles;
create policy reader_profiles_public_read
  on public.reader_profiles
  for select
  using (
    not public.is_reader_suspended(clerk_user_id)
    or public.has_cap('reports:review')
  );
