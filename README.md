# Inner Circle Nepal — Mobile App

The official Android and iOS app for **Inner Circle Nepal** (`https://icn.news`), built with Expo, TypeScript, Expo Router and TanStack Query.

It reads the same Supabase database as the website, and calls the website's API (a separate Next.js repo, `../../site/site`) for anything that needs to know who the reader is: accounts, profiles, follows, and Chautari live audio rooms.

---

## 1. Technology stack

- **Runtime**: React Native `0.88` + Expo SDK `58` (New Architecture), TypeScript `6.0` (`strict`)
- **Navigation**: Expo Router, file-based. Five tabs (Home, Newsroom, Chautari, Saved, Settings) under a custom editorial bottom bar. Deep links: `icn://…` and `https://icn.news/{category}/{slug}`
- **Server state**: TanStack Query v5; the front page, categories and market data are persisted to AsyncStorage so a cold start shows the last edition
- **Accounts**: Clerk (email one-time code), shared with the website. Public reader profiles live in Supabase (`reader_profiles`)
- **Live audio**: LiveKit (`livekit-client`, `@livekit/react-native`) for Chautari rooms
- **Push**: `expo-notifications` through Expo's push service to FCM (Android) and APNs (iOS)
- **Forms**: React Hook Form + Zod
- **Media & type**: `expo-image`, `expo-image-picker`; Newsreader and Archivo fonts, Mukta for Devanagari
- **Storage**: AsyncStorage for preferences and saved stories; `expo-secure-store` for the device push token
- **Tests**: Vitest

---

## 2. Quick start

### Install

```bash
npm install
```

> **Do not remove the `typescript` override in `package.json`.** It exists so
> that `npm ci` resolves the same tree on every npm version, which is what the
> EAS builder runs. Clerk pulls in `@solana/web3.js` (via `@clerk/clerk-js` and
> the Solana wallet adapters), whose nested `@solana/codecs-*` packages declare
> an optional `typescript: ^5.0.0` peer. Our root TypeScript is 6.x, so that
> peer is unsatisfiable: npm 11 quietly skips it, while npm 10 — the version on
> the EAS image — installs a second, nested `typescript@5.9.3`. A lockfile
> written by npm 11 therefore has no entry for it, and `npm ci` on EAS fails the
> Install dependencies phase with `Missing: typescript@5.9.3 from lock file`.
> Pinning every `typescript` edge to our own version (`$typescript`) removes the
> nested copy, so both npm versions agree. Regenerate the lockfile with
> `npm install` after changing the TypeScript version.

Add packages with `npx expo install <pkg>`, never `npm install <pkg>`, so versions match the SDK.

### Environment

Copy `.env.example` to `.env`:

```env
EXPO_PUBLIC_SITE_URL=https://icn.news
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<public anon key>
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...        # optional: accounts + Chautari
EXPO_PUBLIC_CHAUTARI_API_URL=https://api.icn.news
```

Without the Supabase values the app starts and shows its empty states. Without the Clerk key, accounts and Chautari are hidden and reading works as normal.

> **Security**: everything in `.env` is compiled into the app and is public. Never put a server secret here (Supabase service role, Clerk secret key, LiveKit API secret, VAPID key). The app asks the website's API for anything that needs one.

### Run

The app uses native modules (LiveKit, notifications) that Expo Go doesn't include, so develop on a **development build**:

```bash
# once, or whenever a native dependency changes
npx eas-cli@latest build --profile development --platform android --local
adb install build-*.apk

# day to day: JS changes reload from Metro, no rebuild
npm run start
```

### Run against a local backend

To test pushes, rooms and follows without touching production, run Supabase, the website and LiveKit on this laptop and point the app at them. Setup is described in `CLAUDE.md` ("Local backend"). Day to day:

```bash
npx supabase start                 # local Supabase (Docker)
# in the site repo: npm run dev, and the LiveKit container in infra/livekit/local/
npm run start:local                # Metro with local-backend.env
npm run adb:reverse                # phone → laptop over USB; re-run after replugging
npm run bots -- live sita "Title"  # a bot goes live; its followers get the push
```

`npm run start` switches back to production. `local-backend.env` holds the local addresses and is never committed or uploaded to EAS.

### Check

```bash
npm run check          # typecheck + lint + tests: run before calling work done
npm run test:offline   # tests without the live-backend one
npx vitest run tests/chautariRoom.test.tsx          # one file
npx vitest run tests/chautariRoom.test.tsx -t "hand" # tests matching a name
npm run doctor         # expo-doctor
```

`tests/liveApi.test.ts` talks to the real Supabase project. It needs network and a populated `.env`, and it asserts live data counts that drift as the newsroom publishes. Use `npm run test:offline` when the backend shouldn't be a dependency.

---

## 3. Project structure

```text
app/                         Expo Router routes
  _layout.tsx                Root Stack, providers, fonts, notification taps, profile gate, BottomNav
  +native-intent.tsx         Every link the OS opens the app with: icn.news paths → app screens
  +not-found.tsx             Catch-all for paths no screen matches
  (tabs)/                    The five tabs, kept mounted between switches
    index.tsx                Home: front page
    explore.tsx              Newsroom: sections, topics, forex and NEPSE tools
    chautari.tsx             Chautari lobby: live rooms, Coming up, Your rooms
    bookmarks.tsx            Saved stories (offline)
    settings.tsx             Theme, language, editions, push alerts, newsletter, contact desk
  article/[slug].tsx         Article reader (narration, bilingual toggle)
  [category]/[slug].tsx      Website-URL deep link route
  category/[slug].tsx        Section page
  search.tsx                 Full-text search
  sign-in.tsx                Email + one-time-code sign-in / sign-up
  profile.tsx                Edit your profile (name, bio, picture)
  profile/complete.tsx       Mandatory profile setup after first sign-in
  user/[username].tsx        A reader's public profile, follow button
  chautari/[slug].tsx        A room: live room, or waiting room if scheduled
  chautari/new.tsx           Open or schedule a room (cover photo, moderators)
  chautari/mine.tsx          Rooms you host or moderate
  chautari/earn.tsx          Earning programme
src/
  components/                Design-system components; chautari/ holds room UI
  features/                  Domain hooks and providers (articles, chautari, profile, pushNudge, …)
  lib/api/                   Supabase queries and API clients (chautari, readerProfile, pushRegistry, …)
  lib/livekit/               LiveKit platform seam (native vs web) and background audio
  lib/notifications/         Push permission, channels, token, tapped-notification routing
  lib/query/                 Query client and persistence
  lib/storage/               AsyncStorage / SecureStore adapters
  theme/, types/, utils/
modules/chautari-audio-service   Local native module for background room audio (Android)
plugins/                     Expo config plugins
supabase/                    Push Edge Functions, the local test stack (config, baseline, seed, scripts),
                             and the hand-applied history in legacy-migrations/ (see §6)
tests/                       Vitest suite
```

---

## 4. Accounts and profiles

Sign-in is Clerk with an emailed one-time code; the Clerk application is shared with the website, so one account works in both. Clerk proves who the reader is. Their **public identity** is a row in Supabase `reader_profiles`: a unique @username, display name, bio and avatar URL.

- After signing in, a reader without a profile is sent to a one-step setup screen (username + display name) before the app opens. Readers who were already signed in hit the same screen on their next launch.
- Profiles and follows, reads and writes, go through the website's API (`/api/reader/*`), which verifies the Clerk session for writes. The tables are publicly readable in Supabase, but the app doesn't query them directly.
- Profile pictures are uploaded to Clerk's CDN and the URL is mirrored into `reader_profiles.avatar_url`, so other readers can see them. Anyone without a picture is shown with initials.

---

## 5. Chautari (live audio rooms)

Clubhouse-style audio rooms on LiveKit.

- **Joining**: the app asks the website for a short-lived join token. The server decides the reader's role from its database, and the microphone permission is part of the signed token, so the app can't grant itself one.
- **In a room**: a stage of speakers and a grid of listeners. Avatars show who is speaking, muted, or has a hand raised. Tap anyone for their profile, Follow, and (for the host and moderators) Invite to stage, Move to audience, Mute, Make moderator, Remove. Everyone can Block or Report. The bottom bar holds Leave, the microphone or raise-hand button, and a raised-hands queue for hosts and moderators.
- **Moderators**: the host can make anyone a moderator, mid-room or when creating the room. Moderators have the host's controls but can't act on the host.
- **Scheduling**: rooms can be opened now or booked up to 30 days ahead (Kathmandu time). A booked room shows a waiting room with a countdown; the host or an assigned moderator taps **Go live**. Bookings nobody starts drop off three hours after their time.
- **Cover photos**: an optional banner per room, resized by the website before storage.
- **Staying in the room**: the connection is held by `ActiveRoomProvider`, so leaving the screen keeps the audio going (a mini bar shows the room), including with the phone locked.
- **Lobby**: live rooms as cover cards, a "Coming up" row of scheduled rooms, and "Your rooms". The Chautari tab icon animates while any room is live.

---

## 6. Push notifications

Phones that turn alerts on register an Expo push token in Supabase (`mobile_push_tokens`). Senders are Supabase Edge Functions in `supabase/functions/`:

| Notification | Sent when | Function |
|---|---|---|
| Breaking news | A story is published as breaking | `send-breaking-push` (database webhook) |
| Chautari live | A room goes live, including a scheduled one starting | `send-chautari-live-push` (database webhook) |
| Weekly reminder | Tue / Thu / Sat, 08:00 Nepal time | `send-reminder-push` (`pg_cron`) |

Each type has its own switch in Settings (Chautari and reminders require breaking-news alerts to be on). Readers are invited to turn alerts on with a soft ask before the system prompt: a dot on the Settings tab and a one-time sheet after they've read a few stories or joined a room.

Setup for the database, functions and webhooks is in `supabase/README.md`. Production migrations are applied by hand in the Supabase SQL editor; `supabase/migrations/` only builds the local test database.

---

## 7. Listening to a story

Articles can be read aloud from the byline bar. It uses the **device's own
speech engine** (`expo-speech`), not a speech API: free, offline, no audio to
store, and already the voice a reader has configured for accessibility.

Long articles exceed what one utterance may contain, so the text is split at
sentence boundaries and spoken in sequence — including on the Devanagari
danda (`।`), without which every Nepali article becomes one unbroken chunk.
Android has no true TTS pause, so pausing there stops and resuming restarts
the current sentence; that is deliberate and commented in
`src/features/audio/useNarration.ts`.

---

## 8. Releasing

- Bump `expo.version` in `app.json`. Build numbers are tracked and incremented by EAS (`appVersionSource: remote`).
- `npx eas-cli@latest build --profile production --platform android|ios`
- iOS: `npx eas-cli@latest submit --profile production --platform ios`, then TestFlight and App Store review in App Store Connect.
- Android: upload the `.aab` from the EAS build page in Play Console (Production or a testing track).
- Ship backend changes first: database migrations, then the website deploy, then the app.
- App Links / Universal Links: publish or change the site's `public/.well-known/` files only after the app version that handles those links is live in both stores.

---

## 9. Known gaps

- Data notes from the original build, worth re-checking: no published story has an author (bylines fall back to the newsroom), and the Nepali-body and Nepali-search migrations (`2026-10-nepali-bodies.sql`, `2026-10-nepali-search.sql`) were unapplied; the data layer falls back when those columns are missing.
- No component rendering tests: the suite covers data, parsing, state machines and API clients. Vitest can't load React Native, so screens aren't rendered in tests.
- `app/(tabs)/settings.tsx` and `app/chautari/[slug].tsx` are large and mix several concerns.
- Follows have no lists or search yet; the way to reach someone's profile is from a Chautari room.
- "Remind me" for scheduled rooms and follower-based Chautari notifications are planned together as a notifications overhaul.
- iOS push is configured but has not been verified on a device.
