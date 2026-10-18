# Inner Circle Nepal — Native Mobile Application (`mobile/`)

The official Android and iOS React Native application for **Inner Circle Nepal** (`https://icn.news`), built with Expo, TypeScript, Expo Router, and TanStack Query.

Designed as a native mobile broadsheet, this application shares the live Supabase database, editorial taxonomy, and design language of the existing Next.js website (`../site/`) while remaining completely isolated in `mobile/`.

---

## 1. Technology Stack

- **Runtime & Framework**: React Native `0.88` + Expo SDK `58` (New Architecture enabled)
- **Language**: TypeScript `6.0` (`strict: true`)
- **Navigation**: Expo Router (`expo-router`) with file-based routing, custom editorial bottom navigation (`Home`, `Explore`, `Saved`, `Settings`), and universal deep linking (`icn://` and `https://icn.news/{category}/{slug}`)
- **Server-State & Caching**: TanStack Query v5 (`@tanstack/react-query`)
- **Forms & Validation**: React Hook Form (`react-hook-form`) + Zod (`zod`) + `@hookform/resolvers`
- **Media & Typography**:
  - `expo-image` with memory-disk caching for editorial photography
  - `@expo-google-fonts/newsreader` (`300Light`, `400Regular`, `400Regular_Italic`, `500Medium`)
  - `@expo-google-fonts/archivo` (`400Regular`, `500Medium`)
  - `@expo-google-fonts/mukta` (`400Regular`, `500Medium`) for Devanagari (`नेपाली`)
- **Persistence & Security**:
  - `@react-native-async-storage/async-storage` for non-sensitive preferences (`icn-theme`, `icn-lang`, `icn-edition`, `icn-recent-searches`) and lightweight saved bookmarks (`icn-saved-bookmarks-v1`)
  - `expo-secure-store` for sensitive device push tokens
- **Notifications**: `expo-notifications` + `expo-device`

---

## 2. Quick Start

### Prerequisites
- Node.js 18+ and npm
- Android Studio (Android emulator) or Xcode (iOS Simulator), or the Expo Go / Expo Development Build client on a physical device

### 1. Install dependencies
```bash
cd mobile
npm install
```

### 2. Configure environment variables
Copy `.env.example` to `.env` and populate the public client variables (already configured for local development in `.env`):

```env
EXPO_PUBLIC_SITE_URL=https://icn.news
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<your-public-supabase-anon-key>
```

Use the same project URL and anon key the website reads (`site/.env`). Without
them the app starts and renders its empty and error states correctly, but no
stories load.

> **Security Note**: Never place `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_PASSWORD`, or `VAPID_PRIVATE_KEY` in `mobile/.env`. Everything bundled into a mobile client is public; all mobile reads rely on Supabase Row-Level Security (RLS) public read policies.

### 3. Run the application
```bash
# Start the Expo development server
npm run start

# Launch on Android emulator / connected Android device
npm run android

# Launch on iOS Simulator (macOS)
npm run ios

# Typecheck, lint and test (what `npm run check` runs)
npm run typecheck
npm run lint
npm run test
npm run check

# Everything except the live-backend test (no network / no .env needed)
npm run test:offline

# Expo dependency and config diagnostics
npm run doctor

# Production bundle, without native tooling
npx expo export --platform android
```

### A note on the test suite

`tests/liveApi.test.ts` talks to the real Supabase project: it is an
integration check, not a unit test, and it fails without network access or a
populated `.env`. Everything else runs offline — use `npm run test:offline`
in CI if the backend should not be a dependency of the build.

---

## 3. Project Structure

```text
mobile/
  app/
    _layout.tsx            # Root providers, font loader, deep-link listener, BottomNav shell
    index.tsx              # Editorial Homepage (Lead, Wire, Immigration, Most Read, NEPSE, Forex, Newsletter, Investigations)
    article/[slug].tsx     # Long-form Article Reading Screen
    [category]/[slug].tsx  # Canonical website deep-link route (https://icn.news/{category}/{slug})
    category/[slug].tsx    # Category / Section Screen (including NEPSE Board & Locked Section view)
    explore.tsx            # Section Directory, Topic Tags, & Interactive Market/Forex Tools
    search.tsx             # Full-Text Search (Postgres websearch + Devanagari fallback) & Tag Filter
    bookmarks.tsx          # Offline-persisted Saved Dispatches queue
    settings.tsx           # Theme, Language (EN/नेपाली), Diaspora Clocks, Push Alerts, Newsletter, & Contact Desk
  src/
    components/            # Reusable broadsheet design-system components
    constants/             # Site identity, diaspora editions, and pagination config
    features/              # Domain hooks & context (articles, categories, bookmarks, search, market)
    hooks/                 # Theme & utility hooks
    lib/
      api/                 # Supabase client, article queries, NRB forex, YoNEPSE market data, newsletter
      notifications/       # Push notification permissions, channels, SecureStore token handling
      query/               # TanStack Query client configuration
      storage/             # AsyncStorage & SecureStore adapters
    theme/                 # Broadsheet color palettes, typography tokens, and ThemeProvider
    types/                 # Strict TypeScript domain models matching supabase/schema.sql
    utils/                 # HTML-to-native AST parser, deep-link resolver, image sizing, formatters
  tests/                   # Vitest unit & live Supabase integration test suite
```

---

## 4. What the backend actually provides

Checked against the live project rather than assumed, so the app does not
promise more than the data supports:

| Area | State |
| --- | --- |
| `articles`, `categories`, `authors`, `tags`, `forex_rates` | Readable with the anon key under RLS |
| Published stories | 284, all with a category |
| `authors` | **No published story has an author.** Bylines fall back to "Inner Circle Nepal newsroom" and the reporter bio block is hidden |
| `body_ne`, `search_vector_ne` | **Columns do not exist** — `supabase/2026-10-nepali-bodies.sql` and `2026-10-nepali-search.sql` are unapplied. The data layer detects `42703` and falls back, so Nepali bodies and Nepali full-text search are unavailable until they are run |
| `title_ne` / `excerpt_ne` | Present on 14 of 284 stories; the bilingual toggle appears only on those |
| `increment_article_views` RPC | Works from the anon key |
| Supabase image transforms (`/render/image/`) | Enabled — used to size photography per view |
| Push notifications | Permissions, Android channel and SecureStore token handling are implemented. The website backend sends **Web Push only**; there is no Expo/FCM/APNs sender, so no remote push is actually delivered to this app yet |

---

## 5. Listening to a story

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

## 6. Known gaps

- No automated coverage of screen rendering — the suite covers data, parsing,
  storage and navigation logic. Component tests would need a React Native
  renderer, which is not configured.
- `settings.tsx` is large (≈900 lines) and mixes appearance preferences,
  notification handling and the contact form.
- Offline behaviour is in-memory only: TanStack Query's cache is not persisted
  across launches, so a cold start with no network shows error states rather
  than yesterday's edition. Saved stories **are** on-device and do render
  offline.
