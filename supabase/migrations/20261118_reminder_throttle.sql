-- ============================================================================
--  Reminders that leave active readers alone.
--
--  `send-reminder-push` used to nudge every opted-in phone on each run
--  (Tue/Thu/Sat). Now it skips a phone when:
--    * the app was opened there in the last 3 days. `last_seen_at` is
--      refreshed by the app's launch / return-to-foreground re-registration,
--      so it is a good enough "has been reading";
--    * it was reminded in the last 4 days (`last_reminded_at`, set by the
--      sender), so even a lapsed reader gets at most about two a week.
--
--  Run once in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

alter table public.mobile_push_tokens
  add column if not exists last_reminded_at timestamptz;
