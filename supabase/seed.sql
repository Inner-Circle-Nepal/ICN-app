-- Local-only setup that the schema dump can't carry, loaded by `supabase db reset`
-- after the migrations and after supabase/seed/*.sql (real content, gitignored).
--
-- Never run this against production: the URL and secret below are local.

-- The weekly reminder, as in production (Tue/Thu/Sat 02:15 UTC = 08:00 NPT).
-- To test it without waiting, run the command inside $$ … $$ in Studio's SQL editor.
select cron.schedule(
  'reminder-push',
  '15 2 * * 2,4,6',
  $$
  select net.http_post(
    url := 'http://kong:8000/functions/v1/send-reminder-push',
    headers := '{"Content-Type":"application/json","x-webhook-secret":"local-webhook-secret"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Bot readers to follow and to host rooms. Database rows only: the site checks
-- Clerk for the person making a request, never for the people it shows, so
-- these need no Clerk account. They can't sign in or act on their own; drive
-- their rooms with supabase/scripts/bots.sh. Ids start `user_bot_` so they are
-- easy to tell apart from real (Clerk development) test accounts.
insert into public.reader_profiles (clerk_user_id, username, display_name, bio) values
  ('user_bot_sita',  'bot_sita',  'Sita Bot',  'Test host. Talks about markets and the morning news.'),
  ('user_bot_ram',   'bot_ram',   'Ram Bot',   'Test host. Cricket, mostly.'),
  ('user_bot_maya',  'bot_maya',  'Maya Bot',  'Test host. Books rooms for later.')
on conflict (clerk_user_id) do nothing;
