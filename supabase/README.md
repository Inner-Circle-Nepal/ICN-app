# Mobile breaking-news push — Supabase setup

The app registers each phone that turns on **Settings → Breaking News Push
Alerts**. When a story is published with **Breaking** ticked, every registered
phone gets an alert that opens the story.

```
app ──register_push_token()──▶ mobile_push_tokens
articles (published + is_breaking) ──webhook──▶ send-breaking-push ──▶ Expo ──▶ APNs / FCM ──▶ phones
```

Apple's push key is already on the Expo project (`@trashhpandaaaa/inner-circle-nepal`),
so no Apple setup is needed here.

## 1. Database (once)

Supabase dashboard → **SQL Editor** → paste and run
[`migrations/20261030_mobile_push.sql`](migrations/20261030_mobile_push.sql).

It creates `mobile_push_tokens`, `mobile_push_log` and two functions. Phones
can add or remove only their own token and cannot read the list.

## 2. Sender function

With the Supabase CLI, from this repo:

```bash
npx supabase login
npx supabase link --project-ref ahtorfmlyxpknjndeoqo
npx supabase functions deploy send-breaking-push --no-verify-jwt
npx supabase secrets set WEBHOOK_SECRET=<a long random string>
```

(`--no-verify-jwt` because the webhook authenticates with `WEBHOOK_SECRET`
instead.) Or create the function in the dashboard (**Edge Functions → Deploy a
new function**) and paste `functions/send-breaking-push/index.ts`.

## 3. Webhook

Dashboard → **Database → Webhooks → Create a new hook**:

| Field | Value |
|---|---|
| Table | `public.articles` |
| Events | Insert, Update |
| Type | Supabase Edge Functions → `send-breaking-push` |
| HTTP headers | `x-webhook-secret: <the same WEBHOOK_SECRET>` |

## 4. Test

1. On a phone with the app (build that includes this change), Settings → turn on alerts.
2. Check `select count(*) from mobile_push_tokens;` is 1 or more.
3. Publish a story with **Breaking** ticked (or tick it on a published story).
4. The phone gets "Breaking — <headline>"; tapping opens the story.
5. `select * from mobile_push_log order by sent_at desc;` shows it was sent once.

A story is alerted at most once, however often it is edited afterwards.

## Limitations

- **Scheduled stories:** an article whose `published_at` is in the future
  when it is saved is skipped. When it goes live nothing updates the row, so
  no alert is sent. Untick and re-tick Breaking after it is live, or add a
  `pg_cron` job that touches due breaking stories.
- Nepali-language readers get `title_ne` when the story has one, English
  otherwise.

## Alerts about people, invites and quieter reminders (2026-11)

Run the SQL in this order in the SQL editor (each is safe to re-run):

1. `migrations/20261118_reader_profile_search.sql`: people search.
2. `migrations/20261118_push_accounts.sql`: `clerk_user_id` and
   `breaking_enabled` on `mobile_push_tokens`; registration takes a breaking flag.
3. `migrations/20261118_follow_alerts.sql`: `user_follows.notify`.
4. `migrations/20261118_reminder_throttle.sql`: `last_reminded_at`.
5. Site repo `supabase/2026-11-chautari-invites.sql`: `chautari_invites`.

Deploy the senders (all `--no-verify-jwt`, same `WEBHOOK_SECRET`):

```bash
npx supabase functions deploy send-breaking-push --no-verify-jwt
npx supabase functions deploy send-chautari-live-push --no-verify-jwt
npx supabase functions deploy send-chautari-invite-push --no-verify-jwt
npx supabase functions deploy send-reminder-push --no-verify-jwt
```

One new webhook:

| Field | Value |
|---|---|
| Table | `public.chautari_invites` |
| Events | Insert |
| Type | Supabase Edge Functions → `send-chautari-invite-push` |
| HTTP headers | `x-webhook-secret: <the same WEBHOOK_SECRET>` |

Then deploy the site (it reads the new columns), then ship an app build: the
notification icon is native config and needs a new build, not just Metro.

Who gets what now:

- **Breaking news**: phones with `breaking_enabled`.
- **Someone went live**: followers of the host with `notify` on, on phones
  linked to them with `chautari_enabled`. Nobody else.
- **Invited to a room**: same rule, for the inviter.
- **Reminders**: `reminders_enabled`, not seen for 3 days, not reminded for 4.
