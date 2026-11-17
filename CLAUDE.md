# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Inner Circle Nepal mobile app (Expo SDK 58, React Native 0.88, Expo Router, TanStack Query v5, TypeScript strict). Read `AGENTS.md` too: it requires checking the versioned Expo docs before touching any Expo/EAS API.

## Commands

```bash
npm run start              # Metro (dev client)
npm run check              # typecheck + lint + test: run before calling work done
npm run typecheck          # tsc --noEmit
npm run lint               # eslint
npm run test:offline       # all tests except the live-backend one
npx vitest run tests/chautariRoom.test.tsx          # one file
npx vitest run tests/chautariRoom.test.tsx -t "raised hand"   # one test by name
npx expo install <pkg>     # never npm/yarn add
```

`tests/liveApi.test.ts` hits the real Supabase project and fails without network or `.env` (it also asserts live data counts that drift). Use `test:offline` unless you mean to test the backend.

Builds go through EAS (`npx eas-cli@latest build --profile development|production --platform android|ios`). The development build loads JS from Metro, so JS-only changes need only a Metro reload; adding a package with native code needs a new build. `eas.json` uses `appVersionSource: remote` + `autoIncrement`: only bump `expo.version` in `app.json` by hand.

Do not remove the `typescript` override in `package.json` (see README: it keeps `npm ci` working on the EAS image).

## Architecture

### Our backends, and which one to call

Outside data feeds (Nepal Rastra Bank forex, YoNEPSE market data) are listed in the map under "Backend contracts".

- **Supabase (anon key)**, `src/lib/api/supabase.ts` / `queries.ts`: public reads (articles, categories, tags, forex) protected by RLS, and the push-token RPCs. Never put a service-role key in the app.
- **Website API**, the sibling Next.js repo at `../../site/site` (deployed to a DigitalOcean droplet, not Vercel). Calls that need to know *who* the reader is send a Clerk session as `Authorization: Bearer`. Some routes are public (Chautari `discover` and room details, public profiles, newsletter, contact).
  - `/api/chautari/*` via `CHAUTARI_API_URL` (`https://api.icn.news`, `src/lib/api/chautari.ts`): rooms, join tokens, hands, moderation, banners, scheduling.
  - `/api/reader/*`, `/api/newsletter`, `/api/contact` via `SITE_URL` (`https://icn.news`, `readerProfile.ts`, `newsletter.ts`): profiles (including other readers' public profiles), follows, newsletter, contact desk.
  Since the migration off GoDaddy, both addresses reach the same Next.js process on the droplet. They stay separate variables so Chautari could move to its own host later; the comment in `src/constants/config.ts` describes that intended split, not today's setup.
  The server decides permissions; the app only displays them. Many features need a change in both repos.
- **Supabase Edge Functions + SQL** in `supabase/`: push senders (`send-breaking-push`, `send-chautari-live-push`, `send-reminder-push`) triggered by database webhooks or `pg_cron`. Migrations (here and in the site repo's `supabase/`) are applied by hand in the Supabase SQL editor; there is no migration runner. Deploy order is always database → site → app.

### Identity

Clerk handles sign-in (email OTP only; `app/sign-in.tsx` silently fills the username/password Clerk requires). The reader's public identity is a `reader_profiles` row in Supabase (username, display_name, bio, avatar_url), read through `useMyProfile()`. A signed-in reader without a row is sent to `/profile/complete` by `ProfileCompletionGate` (mounted in `app/_layout.tsx`) and by the sign-in flow. Use `profile.display_name`, not Clerk's `fullName`/`firstName`, anywhere a name is shown.

Builds can run without Clerk configured (`isClerkConfigured`). Clerk hooks throw outside `<ClerkProvider>`, so screens use an outer component that returns a fallback when unconfigured and an inner `...Active` component that calls the hooks.

### Navigation

`app/_layout.tsx` is the root Stack plus providers (theme, persisted query client, bookmarks, active Chautari room, push nudge, Clerk). The five tabs live in the `app/(tabs)/` group, rendered by a Tabs navigator with its own bar hidden (`tabBar={() => null}`) so screens stay mounted; the visible bar is the custom `src/components/BottomNav.tsx`. New non-tab routes get a `Stack.Screen` entry in `_layout.tsx` for their animation.

### Chautari (live audio rooms, LiveKit)

- The connection lives in `ActiveRoomProvider` (`src/features/chautari/ActiveRoom.tsx`), not the room screen, so leaving the screen keeps the audio (shown by `MiniRoomBar`). The screen calls `enter`/`leave`.
- `useChautariRoom.ts` turns LiveKit participants into `RoomMember`s. Server-set **metadata** (fixed per join: username, avatar, host) and **attributes** (change live: `hand`, `mod`) are parsed defensively there.
- Pattern: the site API writes the database record first, then updates LiveKit so every client sees it. A raised hand or a moderator appointment is visible because the server sets an attribute, not because the app holds local state.
- Rooms can be `scheduled` (waiting room, Go live by host or assigned moderator), `live`, or `ended`. Times are shown in Kathmandu time (`src/features/chautari/schedule.ts`).
- Room UI components are in `src/components/chautari/`.

### Native-module seams

Some native modules are missing in Expo Go or on web, and importing them at module scope crashes the whole app. They are reached through guarded seams: `src/lib/notifications/module.ts` (expo-notifications), and `src/lib/livekit/platform.ts` vs `platform.native.ts` (Metro picks per platform). Keep new uses behind these.

### Push notifications

Device tokens are registered through `SECURITY DEFINER` RPCs (`src/lib/api/pushRegistry.ts`); per-type opt-ins (Chautari, reminders) are columns on the token row and are replayed after every re-registration because re-registering resets them. `src/features/pushNudge/` is the soft-ask flow (tab dot, contextual sheet) that precedes the OS permission prompt.

## The website repo (`../../site/site`)

Next.js 15 (App Router) + Tailwind v4 + Supabase: the public news site at icn.news, the newsroom admin, and every API the app calls with a Clerk session. Commands there: `npm run check` (typecheck + lint + vitest), `npx vitest run tests/<file>`, `npm run dev` (port 3001, `.next-dev`), `npm run serve` (production build on 3000).

Where things are:
- `src/app/api/chautari/*`: rooms (create/end, `[slug]` details, `start`, `mine`), `token` (mints LiveKit join tokens), `hand`, `moderate`, `banner` (resizes uploads with `sharp` into the `chautari-banners` bucket), `discover`, `webhook` (LiveKit join, leave and room-finished events).
- `src/app/api/reader/*`: `profile/me`, `profile/signup`, `profile/[username]`, `profile/check-username`, `follows`.
- `src/lib/chautari/authorize.ts`: **all** Chautari permission rules as pure, unit-tested functions (`decideAccess`, `decideModeration`, `canStartRoom`, `roleAfter`, scheduling rules). Routes only fetch rows and call these. Change rules here and in `tests/chautari-*.test.ts`.
- `src/lib/chautari/session.ts` (`verifiedUserId`: Clerk session from bearer header or cookie), `livekit.ts` (token minting, participant metadata/attributes), `displayName.ts` (names never fall back to a raw `user_…` Clerk id).
- `src/lib/supabase/`: `public.ts` (cookie-free, cached reads), `server.ts` (cookie-bound, admin), `admin.ts` (service role; check the caller's authority in code first).
- `src/lib/rate-limit.ts`: Postgres-backed limits; new public or write endpoints add a rule here.
- `supabase/*.sql`: schema and dated migrations for the site and Chautari (e.g. `2026-10-chautari.sql`, `2026-11-chautari-moderators.sql`, `2026-11-chautari-scheduling.sql`). The mobile repo's `supabase/migrations/` holds the app-owned tables (push tokens, `reader_profiles`, `user_follows`). Both point at the same Supabase project.
- `infra/livekit/`: self-hosting setup for the LiveKit server; the site selects a server through `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`.
- `infra/cron/`: the droplet's scheduled jobs. `icn-cron` (installed at `/usr/local/bin/icn-cron`) calls `https://icn.news/api/cron/<job>` with `CRON_SECRET` from `.env`, retries twice, and logs to `journalctl -t icn-cron`; `icn-site` (installed at `/etc/cron.d/icn-site`) schedules forex (04:00 UTC) and timesheets (18:15 UTC). The digest line is deliberately commented out: enabling it emails every confirmed subscriber. Edit these in the repo, then on the droplet `git pull` as `icn` and re-run `install -m 755|644 <repo file> <path>` as root.

Production is the DigitalOcean droplet, not Vercel. `vercel.json` is a leftover: its crons only ever ran on Vercel and are now replaced by `infra/cron/`. Production is a git clone at `/srv/icn/site`, built as the `icn` user and run by the systemd unit `icn-api`; its secrets are in `/srv/icn/site/.env` (owned by `icn`, mode 600; Next.js reads it at start, the unit sets no env file). Deploy = `git pull --ff-only && npm ci && npm run build` as `icn`, then `systemctl restart icn-api`. Never run git or npm there as root: root-owned files break the next deploy with `EACCES`. When checking secrets there, print names or counts (`grep -c '^NAME=.\+' .env`), never values.

Email: Clerk sends sign-in codes itself. Resend (`RESEND_API_KEY`, `NEWSLETTER_FROM`) only sends the site's newsletter mail (confirmations, unsubscribes, digest). The Resend account is still the previous developer's; moving it is an open item, so don't rotate that key casually.

Conventions there: route handlers return `{ ok: true, ... }` or `{ ok: false, error, reason }` (the app's API clients branch on `reason`); every Chautari write updates the database before LiveKit; migrations are re-runnable (`if not exists`, `drop … if exists`).

## Backend contracts the app depends on

Behaviour that spans the site repo, Supabase and the app. Change both sides together.

### Map: everything the app calls

| What | Where | Client |
|---|---|---|
| Articles, categories, tags, authors, `article_tags` (reads); `increment_article_views` RPC | Supabase, anon key | `src/lib/api/queries.ts` |
| Forex | Supabase `forex_rates` (filled by the site's `/api/cron/forex`), falling back to Nepal Rastra Bank's API directly | `forex.ts` |
| NEPSE | YoNEPSE's public JSON on GitHub (raw + Pages mirror); not our backend | `nepse.ts` |
| Newsletter signup, contact desk | Site `POST /api/newsletter`, `POST /api/contact`, falling back to direct inserts into `subscribers` / `contact_messages` | `newsletter.ts` |
| Push tokens and per-type opt-ins | Supabase RPCs | `pushRegistry.ts` |
| Reader profiles, follows | Site `/api/reader/*` (Clerk bearer) | `readerProfile.ts` |
| Chautari | Site `/api/chautari/*` at `CHAUTARI_API_URL` (Clerk bearer) | `chautari.ts` |

Site routes the app does **not** use (web or staff only): `ads/*`, `cron/*` (digest, forex, timesheets; guarded by `CRON_SECRET`), `edition`, `market/nepse`, `newsletter/unsubscribe`, `push/subscribe` (Web Push for browsers), `reader/newsletter`, `reader/preferences` (edition stored in Clerk `publicMetadata`), `search`, `track`, and everything under `/admin`.

### Articles (pre-existing)

- Only `status = published` rows are readable with the anon key (RLS). There is no app-side write path for content; the newsroom publishes through the site's `/admin`.
- `title_ne` / `excerpt_ne` exist on some stories; `body_ne` and `search_vector_ne` exist only once `2026-10-nepali-bodies.sql` / `2026-10-nepali-search.sql` are applied. `queries.ts` catches Postgres `42703` (undefined column) and retries without them; keep that fallback when adding columns.
- Search is Postgres websearch over `search_vector`, with a Devanagari `ilike` fallback.
- Images are sized through Supabase's `/render/image/` transform.

### Chautari

Tables (`site/supabase/2026-10-chautari.sql`, plus the moderators and scheduling migrations): `chautari_rooms` (slug, title, `status` `scheduled|live|ended`, `scheduled_for`, `host_clerk_id`, `max_participants` default 200, `banner_url`, counts), `chautari_participants` (room, Clerk id, role, `left_at`, removal), `chautari_speaker_requests` (raised hands), `chautari_host_entitlements` (who may host).

- **Who may host**: `CHAUTARI_HOSTING` on the site is `open` (default: any signed-in account unless a revoked entitlement row bars them) or `invite` (only accounts with an unrevoked entitlement row). Fails closed if the table can't be read. Refusal is `not_entitled_to_host` (403).
- **Joining** (`POST /token`): verify Clerk session → load room → read the stored role → enforce capacity and removal → mint a short-lived token whose grants come from the role. Refusals carry a `reason` the app branches on: `not_signed_in`, `room_not_found`, `room_ended`, `room_full`, `removed_from_room`, `not_entitled_to_host`, `room_not_started`. Moderation refusals: `not_host`, `room_ended`, `target_is_host`, `target_is_self`, `target_not_in_room`.
- **Presence** (`POST /webhook`, called by LiveKit, signature-verified): `participant_joined` / `participant_left` set `left_at` and counts; `room_finished` ends the room. Handlers set values rather than toggle, because events repeat and arrive out of order. This is what clears readers who force-quit or lose signal.
- **Report and block** have no Chautari endpoint. Report sends a `Chautari report` message through the contact desk (`/api/contact`). Block is on-device only (`src/lib/storage/chautariBlocks.ts`): it silences that person's audio locally.
- **Roles** live in `chautari_participants.role`: `host`, `moderator`, `speaker`, `listener`. The host is also recognised from `chautari_rooms.host_clerk_id`. Host, moderator and speaker get `canPublish`.
- **Moderation** (`POST /api/chautari/moderate`, actions `approve_speaker`, `deny_speaker`, `demote_speaker`, `mute`, `remove`, `make_moderator`, `remove_moderator`): allowed for the host or a moderator who is in the room. Nobody can act on the host or on themselves. Moderators have every host control, including ending the room.
- **LiveKit participant fields**, all set by the server: identity is the Clerk user id; name is the resolved display name; metadata is JSON `{ username, avatar, host }` fixed at join; attributes `hand` (set by `POST /hand` with `raised: true`; cleared by the listener with `raised: false`, or when the host or a moderator approves or denies) and `mod` (set by `make_moderator`, also minted into a moderator's token so it survives reconnects). The app reads these in `useChautariRoom.ts`.
- **Names**: `rooms` and `token` resolve the display name from `reader_profiles`, then a cleaned client value, then `"Guest"`. Never a raw `user_…` id.
- **Lifecycle**: `scheduled` → `live` via `POST /rooms/start` (host or an assigned moderator, no need to be present; a conditional update so a double tap starts once) → `ended` via `DELETE /rooms?slug=` (which also cancels a scheduled room). `POST /token` refuses a scheduled room with `room_not_started` (409). A booking unstarted 3 h after `scheduled_for` counts as expired: hidden from `discover` and `mine`, reported as `ended` by `GET /rooms/[slug]`, and refused by `start`.
- **Creating a room** (`POST /rooms`): optional `scheduledFor` (5 min to 30 days ahead), `bannerUrl` (must be a URL returned by `POST /banner`, checked against our bucket prefix), `moderators` (up to 3 @usernames, each must have a profile). Pre-assigned moderators are participant rows with `role = moderator` and `left_at` set, so they hold the role without counting as present.
- **Banners** (`POST /banner`): base64 photo in, resized by `sharp` to a 1200×675 JPEG with EXIF stripped, stored in the public `chautari-banners` bucket, public URL out. Rate limited.
- **Listing**: `GET /discover` (public) returns live rooms and unexpired bookings with `bannerUrl`, `hostUsername`, `hostAvatarUrl` and counts. `GET /rooms/[slug]` (public) returns details, host and moderators, plus `canStart` when signed in. `GET /rooms/mine` lists live and scheduled rooms the caller hosts or moderates.
- **Push**: a room changing to `live` (including from `scheduled`) fires `send-chautari-live-push` through the `chautari_rooms` database webhook.

### Reader profiles and follows (`/api/reader/*`)

- `GET /profile/me` returns **404 `profile_missing`** for a signed-in reader with no row. The app's signup gate depends on that 404; don't change it to `200` with `null`.
- `POST /profile/signup` creates the row; `409` with `username_taken` or `profile_exists`. `PATCH /profile/me` accepts only `display_name`, `bio`, `avatar_url`: usernames are immutable.
- The username rule (`^[a-z0-9_]{3,30}$` plus a reserved list) exists in three places that must agree: the database check constraint, `site/src/lib/reader/profile.ts`, and the app's `src/features/profile/validators.ts`.
- `POST /profile/check-username` and `GET /profile/[username]` are public (the first is rate limited). `GET /profile/[username]/follow-status` is public with optional auth: `{ is_following, follower_count, is_self }`.
- `POST /follows` `{ followee_username }` and `DELETE /follows/[username]` are idempotent and return the new `follower_count`; following yourself is `409`.
- `reader_profiles` and `user_follows` allow public `select` and no client writes: all writes use the service role after the Clerk check.

### Newsletter and contact (pre-existing)

- Signup is double opt-in and answers identically whether the address is new, pending or already subscribed (no "you're already on the list" oracle). Without a Resend key the site stores the signup and says no email was sent.
- Contact/tip messages are stored in `contact_messages`; with no database the site returns a prefilled `mailto:` instead.

### Push (this repo's `supabase/`)

- Breaking news (`send-breaking-push`) is the original pipeline: a database webhook on `articles` fires when a story is published with `is_breaking`, and the push opens the story. Browsers get the same story through the site's separate Web Push (`push_subscriptions`, VAPID), which the app does not use. As of 2026-11-17 the droplet's `.env` has no VAPID keys, so browser push likely isn't sending.
- `mobile_push_tokens` is written only through RPCs (`register_push_token`, `unregister_push_token`, `set_chautari_push_preference`, `set_reminder_push_preference`); the anon key cannot read the list.
- Each sender dedupes by inserting into a log table keyed on what it notifies about (`mobile_push_log.article_id`, `chautari_push_log.room_id`, `reminder_push_log.sent_on`), and authenticates callers with the `x-webhook-secret` header against its `WEBHOOK_SECRET`.
- `send-reminder-push` is called by `pg_cron` (job `reminder-push`, Tue/Thu/Sat 02:15 UTC = 08:00 NPT), not by a webhook.

## Testing constraints

- Vitest runs in `node`; add `// @vitest-environment jsdom` for tests that render providers with `react-dom`.
- Vitest cannot parse `react-native`'s source. A module that imports `react-native` can't be imported in a test: mock it (`vi.mock`, with shared values via `vi.hoisted`) or move the pure logic into a React-free file (e.g. `src/lib/notifications/path.ts`).
- Tests cover data, parsing, state machines and API clients; there is no React Native component renderer configured.

## Lint rules that are enforced

The React hooks lint rules fail the build, not just warn: no reading `ref.current` during render (create `Animated.Value`s with `useMemo`), no impure calls like `Date.now()` in render, no synchronous `setState` in an effect body, and all hooks before any early return.
