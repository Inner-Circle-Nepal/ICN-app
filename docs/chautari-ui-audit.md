# Chautari UI Audit — Discovery Feed & Live Audio Rooms

**Date:** 2026-10-19 · **Phase:** audit and planning only. No code changed.
**Scope:** `mobile/` Chautari screens; `site/` read only where it defines the API contract.

Every claim cites a file and line. Nothing is asserted about a feature I did not locate in source.

---

## Repository baseline **[VERIFIED]**

| | `mobile/` | `site/` |
|---|---|---|
| Root | `…/app/mobile` | `…/app/site` |
| Branch | `chore/pre-auth-baseline` | `main` |
| HEAD | `c386e35` | `2ae6ea4` |
| Upstream | **none — not pushed** | `origin/main` |
| `git status --short` | **clean** | `?? docs/` |

The three preservation commits from the previous phase are intact and unpushed. This audit adds
one untracked file (this report). Nothing was staged, committed, formatted, or generated.

**Stack:** Expo SDK 58, React Native 0.88, Expo Router (file-based), TanStack Query v5,
`livekit-client` driven directly, `react-native-svg` for icons, Vitest. No UI component library —
the app uses `StyleSheet` with its own tokens (`src/theme/tokens.ts`).

---

## A. Executive summary

### Current state

Chautari is **three screens and one hook**, roughly 1,400 lines. It is unusually well-reasoned
code: the security model is correct, the LiveKit lifecycle is deliberate, and the comments explain
real incidents rather than restating the syntax. The problems are not sloppiness — they are gaps
where the *visual* and *stateful* design never caught up with the engineering.

It is also, visually, **a newspaper schedule rendered as text**. There is not one image, avatar, or
card in the entire feature. That is a deliberate inheritance from the design system, not an
oversight — which makes the brief's goal a genuine design decision rather than a cleanup. See §F.

### The three biggest UX problems

**1. You join a room and cannot see which room you are in.**
`app/chautari/[slug].tsx` renders a header containing only a back arrow labelled "Leave" and the
word "Chautari" ([`:352-380`](../app/chautari/%5Bslug%5D.tsx#L352)). The room's **title, topic,
description, and host are never displayed anywhere on the screen.** The data exists in the
discovery payload but is neither passed through navigation nor refetched. A listener who follows a
deep link or returns from the background has no way to know what they are listening to.

**2. The discovery feed contradicts itself when nothing is live.**
`FlatList` is given `data={live}` ([`:56`](../app/chautari.tsx#L56)), while scheduled rooms render
from `ListFooterComponent` ([`:116-130`](../app/chautari.tsx#L116)). When `live` is empty and
`upcoming` is not, React Native renders `ListEmptyComponent` — *"No conversations right now…
When one starts, it will appear here"* — **directly above a populated "Coming up" list.** The
screen tells the user there is nothing, then shows them something.

**3. Leaving a room can immediately rejoin it.**
The connect effect depends on `room` ([`:70-73`](../app/chautari/%5Bslug%5D.tsx#L70)), which
`useChautariRoom` returns as a **new object on every render**, so the effect runs on every render.
Its guard is `room.phase === "idle"` — and `leave()` sets phase back to `"idle"`
([`useChautariRoom.ts:219-226`](../src/features/chautari/useChautariRoom.ts#L219)). `leaveAndBack`
calls `room.leave()` and *then* navigates. In the render between those, the effect fires and calls
`connect()` again: a fresh token request, a new `Room`, a new audio session — torn down
milliseconds later by the unmount. The user sees nothing; the server sees a spurious join and a
participant upsert on every exit.

### What is good and must be preserved

- **The authorization model.** `canPublish` is read back from the server's grant, never chosen
  locally ([`useChautariRoom.ts:134-135, 204`](../src/features/chautari/useChautariRoom.ts#L134)).
  The mic button exists only when the token says so. A bug in the UI cannot grant a microphone.
- **Speaking indicators are real.** `isSpeaking` comes from LiveKit's participant state and is
  refreshed on `ActiveSpeakersChanged` ([`:59-70, 157`](../src/features/chautari/useChautariRoom.ts#L59)).
  The ring is drawn only when `isSpeaking && !isMuted` ([`[slug].tsx:407`](../app/chautari/%5Bslug%5D.tsx#L407)).
  **No decorative animation fakes audio activity anywhere.** The redesign must keep this property.
- **The generation guard.** `generation.current` invalidates late callbacks from a connection the
  user already left ([`:90, 119, 132`](../src/features/chautari/useChautariRoom.ts#L90)) — a
  genuinely hard class of bug, handled.
- **Graceful degradation.** Expo Go without WebRTC, Clerk unconfigured, and LiveKit unconfigured
  each produce an explanatory screen rather than a crash.
- **Permissions change mid-room.** `ParticipantPermissionsChanged` removes the mic button the
  moment a host demotes a speaker ([`:171-175`](../src/features/chautari/useChautariRoom.ts#L171)).
- **Discovery needs no account** — browsing is public, the gate is on join. Correct product call.

---

## B. Screen and component inventory

### `app/chautari.tsx` — discovery feed (327 lines)

| | |
|---|---|
| **Purpose** | Lists live and scheduled rooms |
| **Data** | `useQuery(["chautari-rooms"], discoverRooms)` → `GET api.icn.news/api/chautari/discover` |
| **State** | `rooms.data/isLoading/isError/isRefetching`; `HostBar` holds `dismissed`; Clerk `useAuth`/`useUser` |
| **Tests** | None for the screen. The API client has 16 tests in `tests/chautariClient.test.ts` |

**Issues**

| # | Issue | Evidence |
|---|---|---|
| D-1 | Empty state renders above populated "Coming up" | `:56`, `:95-115`, `:116-130` |
| D-2 | `isFull` is displayed as text but does **not** block the tap — the user navigates, connects, and only then gets refused | `:247`, `:92` |
| D-3 | `refetchInterval: 60_000` with **no `AppState`/`focusManager` wiring anywhere in the app** → polls forever in the background | `:45`; grep for `AppState` returns nothing |
| D-4 | Loading is a bare `ActivityIndicator`; no skeleton, so the list pops in | `:96-99` |
| D-5 | `RoomRow` is not memoised; every poll re-renders every row | `:196` |
| D-6 | No search, no topic filter, no featured treatment | whole file |
| D-7 | `HostBar` shows "Open a room" to **every** signed-in user; entitlement is only discovered on failure. Deliberate (`:136-142`) but means most users meet a 403 | `:173-193` |
| D-8 | Scheduled rooms show no scheduled *time* — `scheduledFor` is in the payload and unused | `:228-232` |

### `app/chautari/[slug].tsx` — live room (589 lines)

| | |
|---|---|
| **Purpose** | Join, listen, speak, raise hand, host moderation |
| **Data** | `useChautariRoom(slug, getToken, displayName)`; `moderate`/`setHandRaised`/`endRoom` |
| **State** | `room.*` from the hook; local `handRaised`, `handBusy`, `notice`, `liveAudioSupported` |
| **Tests** | **None** |

**Issues**

| # | Issue | Evidence |
|---|---|---|
| R-1 | **No room title, topic, description, or host shown** | `:352-380` — header is back-arrow + "Chautari" |
| R-2 | **Reconnect-on-leave race** (§A.3) | `:70-73`, `:75-79` |
| R-3 | All participants rendered via `.map()` inside a `ScrollView` — unbounded. `max_participants` defaults to **200**, ceiling **1000** | `:401-452`, `:202` |
| R-4 | Bottom controls have **no safe-area inset**. Root is `SafeAreaView edges={["top"]}` and `BottomNav` returns null on this route, so the bar sits under the gesture bar / home indicator | `:259`, `app/_layout.tsx:114`, `BottomNav.tsx:20,29` |
| R-5 | **"Remove" is destructive and unconfirmed**, while "End room" has an `Alert` | `:444-448` vs `:112-131` |
| R-6 | Host actions are 10.5px uppercase text links, three per row — below comfortable touch target and visually indistinguishable from metadata | `:457-480`, `styles.action` |
| R-7 | Mic permission denial silently reverts the toggle with **no message** | `useChautariRoom.ts:236-238` |
| R-8 | `notice` never auto-dismisses and has no dismiss affordance | `:229-233` |
| R-9 | Hand-raised state is local only — leave and rejoin and it resets to "Raise hand" though the server still holds a pending request | `:56`, no refetch |
| R-10 | `room.listenerCount` is computed by the hook and never used; the screen recomputes `listeners` | `useChautariRoom.ts:258` vs `:198` |
| R-11 | Android hardware back bypasses `leaveAndBack`. Teardown still runs on unmount so the connection closes — but the two exit paths differ | no `BackHandler` |
| R-12 | Avatar is a single initial on a 38px circle; no image support anywhere | `:403-415` |

### `app/chautari/new.tsx` — create room (207 lines)

Title + optional description + "Go on air" → `openRoom()` → `router.replace` into the room.
Has `accessibilityLabel`s and an `accessibilityRole="alert"` error. **No tests.** No category
picker, though `chautari_rooms.category_id` exists in the schema.

### `src/features/chautari/useChautariRoom.ts` — the engine (271 lines)

| | |
|---|---|
| **Purpose** | Owns the LiveKit `Room`, phase machine, members, mic |
| **Phases** | `idle → requesting → connecting → connected ⇄ reconnecting → ended / error` |
| **Tests** | **None — the most complex file in the feature is untested** |

**Issues**

| # | Issue | Evidence |
|---|---|---|
| H-1 | `syncMembers` rebuilds the **entire array with new object identities** on every event, including `ActiveSpeakersChanged`, which fires continuously during conversation → every row re-renders several times a second | `:92-98`, `:157` |
| H-2 | `connect` lists `phase` in its deps, so its identity changes on every phase transition; combined with the screen's effect this is what produces R-2 | `:217` |
| H-3 | `RoomEvent.Disconnected` collapses host-ended, removed-by-host, and network-failure into one `"ended"` phase. LiveKit passes a `DisconnectReason` that is **ignored** | `:184-195` |
| H-4 | `listenerCount` counts only participants LiveKit has told this client about — not the server's occupancy. For a large room these diverge | `:258` |
| H-5 | No handling of `MediaDevicesError` or permission denial | whole file |
| H-6 | No `AppState` handling for background/foreground | whole file |
| H-7 | `teardown` is `async` but called without `await` from `leave()` and the unmount effect; a connect racing a teardown relies solely on the generation guard | `:100-114`, `:219-226`, `:249` |

### Supporting files

| File | Note |
|---|---|
| `src/lib/api/chautari.ts` | Clean. 20s timeout, typed errors, bearer token. **16 tests** — the only tested part |
| `src/lib/livekit/platform.native.ts` | Lazy guarded require so Expo Go degrades instead of crashing. Well done |
| `src/components/BottomNav.tsx` | `TAB_ROUTES` contains `/chautari` only, so nav hides inside a room — correct, and the cause of R-4 |
| `src/theme/tokens.ts` | The design system. See §F |

---

## C. Functionality matrix

| Capability | Status | Evidence |
|---|---|---|
| Discovery list (live + scheduled) | ✅ Implemented and verified | `chautari.tsx:48-49`; probe returned `{"ok":true,"rooms":[]}` |
| Pull-to-refresh | ✅ Implemented | `:59-65` |
| Room card: title, host, counts, full flag | ✅ Implemented | `:235-248` |
| Room card: avatars | ❌ **Missing — no data in API** | discover route returns no avatar field |
| Topic / category | ❌ **Missing in API** (exists as `category_id` in DB, never selected) | `discover/route.ts:44-46` |
| Search | ❌ Missing | — |
| Featured room | ❌ Missing | — |
| Scheduled time display | ⚠️ Partial — `scheduledFor` returned, never rendered | `:228-232` |
| Join flow + token request | ✅ Implemented and verified | `useChautariRoom.ts:131` |
| LiveKit connect / audio session | ✅ Implemented | `:140-197` |
| Reconnecting state | ✅ Implemented | `:176-183` |
| Connection-failure state | ✅ Implemented | `:206-215`, `[slug].tsx:173-183` |
| Room-ended state | ⚠️ Partial — exists, but conflates three causes (H-3) | `:184-195` |
| Participant list | ⚠️ Partial — correct, unbounded (R-3) | `[slug].tsx:401` |
| Speaking indicator | ✅ **Real**, LiveKit-driven | `:59-70`, `:407` |
| Mute indicator | ✅ Real, from track publication | `:66`, `:423` |
| Local mute/unmute | ✅ Implemented | `:228-239` |
| Raise hand | ⚠️ Partial — works; state not persisted (R-9) | `[slug].tsx:81-94` |
| Host moderation (mute/demote/invite/remove) | ⚠️ Partial — works; no confirm on remove (R-5) | `:428-450` |
| End room | ✅ Implemented, with confirmation | `:112-131` |
| Role badges (host/speaker/listener) | ⚠️ Partial — `"You are a {role}"` text only; **no per-participant host badge** | `:222-226` |
| Co-host / moderator tier | ❌ **Does not exist** — `authorize.ts:188`: *"there are no moderators below the host in this MVP"* | site |
| Room privacy / invites / join approval | ❌ **Does not exist** | no columns, no code |
| Global ban | ❌ **Does not exist** — only per-room `removed_at` | schema |
| Audio-permission-denied state | ❌ **Missing** (R-7) | — |
| Background / foreground handling | ❌ Missing (H-6) | — |
| Deep links into a room | ✅ Implemented | `icn://`, App Links for `icn.news` |
| Safe-area on controls | ❌ **Missing** (R-4) | — |
| Accessibility labels | ✅ Good coverage on interactive elements | `:264`, `:309`, `:332`, `chautari.tsx:212` |
| Reduced-motion support | ❓ Not applicable yet — no animation exists | — |
| Dynamic type | ❌ Not supported — all sizes are fixed numbers | `tokens.ts`, all styles |
| Screen tests | ❌ **None** for any Chautari screen or the hook | `tests/` |

---

## D. Proposed discovery feed

**Mapped strictly to fields the API returns today**: `slug, title, description, hostName, status,
startedAt, scheduledFor, listeners, speakers, isFull`. Anything needing more is marked
**[needs API]** and deferred — I am not designing around data that does not exist.

```
┌─ Header ─────────────────────────────────────┐
│  CHAUTARI                            [⌕]     │   search deferred — needs API
│  The platform under the tree.                │
├─ ON AIR  ─────────────────────── 3 live ─────┤
│  ╔════════════════════════════════════════╗  │
│  ║ ● LIVE · started 12 min ago            ║  │  ← FEATURED: first live room,
│  ║ Budget 2082: what changed              ║  │    ordered by started_at (the
│  ║ A sentence of description, two lines   ║  │    API already sorts this way).
│  ║ Sushma Thapa · 3 speaking · 47 listening║ │    NOT a ranking algorithm.
│  ║ ┌──────────────┐                       ║  │
│  ║ │  Listen in   │                       ║  │
│  ║ └──────────────┘                       ║  │
│  ╚════════════════════════════════════════╝  │
│  ─────────────────────────────────────────   │
│  ● LIVE · 4 min      Remittance rules        │  ← compact rows for the rest
│  Bikash Rai · 2 speaking · 12 listening      │
│  ─────────────────────────────────────────   │
│  ● LIVE · FULL       Open mic Friday         │  ← full: dimmed, not pressable
│  Anita Gurung · 5 speaking · 200 listening   │
├─ COMING UP ──────────────────────────────────┤
│  TUE 21 OCT, 19:00   Election night          │  ← scheduledFor, finally used
│  Newsroom desk                               │
└──────────────────────────────────────────────┘
```

**Decisions and why**

- **Featured = the first live room by `started_at`**, which is the order the API already returns
  (`discover/route.ts:48-49`). No invented ranking, no "trending".
- **One list, not two.** Fixes D-1: live rooms and scheduled rooms become sections of a single
  `FlatList` via `data` + `renderItem` discriminating on `status`, so `ListEmptyComponent` fires
  only when there is genuinely nothing.
- **`isFull` disables the row** (D-2): reduced opacity, `accessibilityState={{ disabled: true }}`,
  a "Full" chip, and no `onPress`. Failing after navigation is worse than being told up front.
- **Scheduled rooms show their time** (D-8) — `scheduledFor` formatted in Kathmandu time.
- **Skeletons replace the spinner** (D-4): three grey rows at the real row height, so the list does
  not jump.
- **Topic chips are deferred.** They need `category_id` joined into the discover response. Honest
  alternative in P1: no chips at all rather than dead filters.

**States**

| State | Treatment |
|---|---|
| Loading | 1 featured skeleton + 3 row skeletons |
| Empty (genuinely none) | Existing `EmptyState` — kept, it is good |
| Error | Existing `ErrorState` with retry — kept |
| Offline | `refetchOnReconnect` already true; add an offline banner rather than an error |
| Refreshing | Existing `RefreshControl` — kept |

---

## E. Proposed live-room screen

```
┌──────────────────────────────────────────────┐
│ ←  Budget 2082: what changed          ⋯      │  ← R-1 FIXED: the title is here
│    ● LIVE · 50 in the room                   │
├──────────────────────────────────────────────┤
│  ON STAGE                                    │
│   ╭───╮   ╭───╮   ╭───╮                      │
│   │ S │   │ B │   │ A │      ← ring drawn ONLY from
│   ╰───╯   ╰───╯   ╰───╯        isSpeaking && !isMuted
│   Sushma  Bikash  Anita                      │
│   HOST    ·  🔇                              │
│                                              │
│  LISTENING · 47                              │
│   ○ ○ ○ ○ ○ ○ ○ ○  +39                       │  ← capped grid, not a full list
│                                              │
├──────────────────────────────────────────────┤
│  [ 🎙 Muted ]                  [ Leave ]     │
│  ·········· safe-area inset ··············   │  ← R-4 FIXED
└──────────────────────────────────────────────┘
```

**How each dynamic element is driven by real state**

| Element | Source | Never |
|---|---|---|
| Room title / host | **[needs plumbing]** — pass from discovery via router params, fall back to a fetch by slug | Hard-coded |
| `● LIVE` | `room.phase === "connected"` | A timer |
| `Reconnecting…` | `RoomEvent.Reconnecting` | Guessed from latency |
| Speaking ring | `p.isSpeaking && !p.isMuted` (unchanged) | A decorative pulse |
| Mute glyph | `micTrack.isMuted` (unchanged) | Local optimism alone |
| `HOST` badge | `room.role` for self; **[needs API]** for others — see §I Q-2 | Inferred from `canPublish` |
| Stage vs listening | `canPublish` (unchanged) | Position in the array |
| Count | `members.length`, labelled *"in the room"* not *"listeners"*, because it is what this client sees (H-4) | Presented as server truth |

**Stage layout** — horizontal wrap of avatar tiles, 3 per row at 360dp, 4 at ≥400dp. One speaker
centres; many speakers wrap and then scroll. Listeners become a **capped avatar grid (16 + "+N")**
rather than a full list, which is what fixes R-3.

**Connection states**

| State | Today | Proposed |
|---|---|---|
| Requesting | "Checking your access…" | Keep |
| Connecting | "Connecting…" | Keep + stage skeleton |
| Connected | `● Live` | Keep |
| Reconnecting | Text swap | **Amber banner that persists**, stage dimmed, mic disabled |
| Failed | Full-screen `ErrorState` | Keep |
| Ended by host | "This conversation has ended" | **Distinguish via `DisconnectReason`** (H-3) |
| Removed by host | same screen | **"A host removed you from this room"** |
| Network gave up | same screen | **"Connection lost" + Reconnect** |
| Mic permission denied | **silent revert** | **Inline notice + Settings deep link** (R-7) |
| Backgrounded | unhandled | Keep audio (iOS `UIBackgroundModes` is set); resync on foreground |
| Leave | works, but R-2 | Guard the effect so leaving cannot reconnect |

---

## F. Visual design specification

### The tension you need to decide

`src/theme/tokens.ts:3-15` states the house rules verbatim:

> 1. Paper first. Warm off-white ground (#fbfaf7), near-black ink (#14130f).
> 3. Structure with rules, not boxes. Hairlines separate stories.
> 4. One red (#db0a12) … Reserved for the wordmark, live/breaking markers, and active states.
>    **Never decoration.**
> 5. **No gradients, glows, shadows or motion for their own sake.**

The brief asks for something "polished enough to compete with Clubhouse and Discord." Clubhouse and
Discord are built from exactly what rule 5 forbids: soft shadows, gradient avatars, rounded cards,
springy motion. **These goals are not fully compatible, and the conflict should be settled
deliberately rather than resolved by me in a stylesheet.**

**My recommendation: raise the craft inside the broadsheet idiom** — Option A below. ICN's
typographic identity is genuinely distinctive and a Discord pastiche would discard it for something
every competitor already has. Chautari can feel premium through type, spacing, and restraint, the
way a well-set newspaper feature does. Three options are in §I Q-1; this spec assumes A.

### Tokens — existing, reused unchanged

| Token | Light | Dark | Use in Chautari |
|---|---|---|---|
| `paper` / `paper2` | `#fbfaf7` / `#f4f2ed` | `#100f0d` / `#191814` | Ground; avatar fill |
| `ink` / `ink2` / `quiet` | `#14130f` / `#35332c` / `#6f6b60` | `#f7f5f0` / `#d3cfc5` / `#918c80` | Titles / body / meta |
| `rule` / `rule2` | `#e0ddd4` / `#c8c4b8` | `#2a2823` / `#413e37` | Hairlines; inactive rings |
| `red` | `#db0a12` | same | **Live dot and speaking ring only** |

Dark mode is already fully supported through `useTheme()` and both palettes — **no new colour is
needed.** Every value above already exists.

### Proposed additions — small and labelled

| New token | Value | Justification |
|---|---|---|
| `spacing.avatar` | 44 / 56 / 72 | Listener / stage / featured-host sizes |
| `radius.avatar` | `size / 2` | Circles; everything else stays square per rule 3 |
| `motion.ring` | 160 ms ease-out opacity | **Only** the speaking ring. Opacity, not scale — no pulsing |
| `elevation` | **none** | Rule 5 upheld |

### Typography — existing scale

Room title 21/26 `serifMedium` (as `roomTitle` today) · Featured title 26/31 `serifLight` ·
Participant name 15 `serifMedium` · Meta and all labels 10.5–12 `sansMedium`, uppercase,
1.2–1.5 letter-spacing. No new families.

### Avatars

No avatar URL exists anywhere in the API, so **initials on `paper2` with `ink` lettering** remain
the system — now at three deliberate sizes, with the speaking ring as a 2px `red` border and
`rule2` when silent. If avatars are wanted later, that is an API change (§I Q-2), not a style
change. **I am not designing around images that do not exist.**

### Accessibility — required, currently partial

| Requirement | Now | Action |
|---|---|---|
| Labels on icon-only buttons | ✅ good | Preserve |
| Touch targets ≥ 44dp | ⚠️ host actions ~30dp | Fix (R-6) |
| Contrast | ✅ `quiet` on `paper` ≈ 5.1:1 | Preserve; re-check any new dim state |
| Not colour-alone | ⚠️ speaking ring is colour-only | Add a glyph or the word "Speaking" |
| Reduced motion | ❌ absent | Gate the ring transition on `AccessibilityInfo.isReduceMotionEnabled` |
| Dynamic type | ❌ fixed sizes | Out of scope; log as debt |
| Disabled / selected states | ⚠️ partial | Add `accessibilityState` to full rows and the disabled mic |

**No new dependency is proposed.** Everything above is `StyleSheet`, `react-native-svg`, and
`Animated` — all already present. A list virtualiser is not needed if listeners are capped (§E).

---

## G. Prioritized implementation plan

### P0 — correctness, misleading UI, accessibility blockers

| # | Item | Files | Benefit | Risk | Acceptance | Tests |
|---|---|---|---|---|---|---|
| P0-1 | Fix reconnect-on-leave (R-2, H-2) | `[slug].tsx`, `useChautariRoom.ts` | No spurious joins or token requests | Low | Leaving produces exactly one `POST /token` for the session | Hook test: `leave()` then rerender ⇒ no second `connect` |
| P0-2 | Show room title/host/topic in the header (R-1) | `[slug].tsx`, `chautari.tsx` (pass params), `src/lib/api/chautari.ts` | Users know where they are | Low | Title visible in all phases incl. deep link | Screen test with params and with a cold deep link |
| P0-3 | Single-list discovery (D-1) | `chautari.tsx` | Screen stops contradicting itself | Low | 0 live + 2 upcoming ⇒ no empty state, 2 rows | Render test for that exact case |
| P0-4 | Safe-area inset on controls (R-4) | `[slug].tsx` | Controls reachable on gesture-nav devices | Low | Mic and Leave fully above the inset on a Pixel | Manual, §H |
| P0-5 | Confirm destructive "Remove" (R-5) | `[slug].tsx` | No accidental removals | Low | Remove shows an `Alert` like End room | Unit test on the handler |
| P0-6 | Touch targets ≥44dp for host actions (R-6) | `[slug].tsx` | Usable moderation | Low | All host actions ≥44dp | Snapshot of style |
| P0-7 | Mic-permission-denied state (R-7, H-5) | `useChautariRoom.ts`, `[slug].tsx` | User learns why the mic failed | Med — platform-specific errors | Denying permission shows a notice + Settings link | Hook test with a rejecting `setMicrophoneEnabled` |
| P0-8 | Disable full rooms in the list (D-2) | `chautari.tsx` | No dead-end taps | Low | `isFull` row not pressable, marked | Render test |
| P0-9 | Distinguish disconnect reasons (H-3) | `useChautariRoom.ts`, `[slug].tsx` | "Removed" ≠ "network lost" | Med — reason enum varies | Three reasons ⇒ three messages | Hook test per reason |
| P0-10 | **Tests for `useChautariRoom`** | `tests/chautariRoom.test.ts` (new) | The engine stops being untested | Low | Phase machine, guard, mic, teardown covered | — |

### P1 — the visual redesign

| # | Item | Files | Benefit | Dependencies | Risk | Acceptance |
|---|---|---|---|---|---|---|
| P1-1 | Featured live room | `chautari.tsx`, new `RoomFeature.tsx` | Clear entry point | P0-3 | Low | First live room featured; none ⇒ no slot |
| P1-2 | Avatar component (3 sizes, ring, fallback) | new `src/components/chautari/Avatar.tsx` | Visual anchor | — | Low | Renders from a name alone; no network |
| P1-3 | Speaker stage grid | `[slug].tsx`, new `Stage.tsx` | Feels like a conversation | P1-2 | Med — layout | Balanced at 1, 3, 12 speakers |
| P1-4 | Capped listener grid + "+N" (R-3) | `[slug].tsx` | Survives a 200-person room | P1-2 | Low | 200 members ⇒ ≤16 avatars rendered |
| P1-5 | Skeletons (D-4) | `chautari.tsx`, `LoadingSkeleton.tsx` | No layout jump | — | Low | Skeleton height == row height |
| P1-6 | Scheduled time (D-8) | `chautari.tsx`, `utils/format.ts` | "Coming up" becomes useful | P0-3 | Low | Kathmandu time, correct across DST-free NPT |
| P1-7 | Memoise rows + stabilise member identity (D-5, H-1) | `useChautariRoom.ts`, both screens | No full re-render per speaker change | — | Med — identity care | Profiler: speaker change re-renders ≤2 rows |

### P2 — refinement

| # | Item | Notes |
|---|---|---|
| P2-1 | Ring opacity transition, reduced-motion gated | 160 ms, opacity only |
| P2-2 | Persist hand-raised across rejoin (R-9) | **[needs API]** — a `GET` for the caller's pending request |
| P2-3 | Per-participant HOST badge | **[needs API]** — §I Q-2 |
| P2-4 | Topic chips | **[needs API]** — join `categories` into discover |
| P2-5 | `AppState` wiring → pause polling when backgrounded (D-3) | App-wide benefit, not just Chautari |
| P2-6 | Auto-dismiss `notice` (R-8) | 6 s or manual |
| P2-7 | Android `BackHandler` parity (R-11) | Route back through `leaveAndBack` |

---

## H. Validation plan

No device or emulator was available in this session, and **no screen was visually tested.** The
checks below are what I would run; none has been run.

**Static / offline (safe, repeatable)** — `npm run typecheck`, `npm run lint`,
`npm run test:offline`. These last passed in this session at the current commit
(`c386e35`): typecheck ✅, lint ✅, **80/80 offline tests ✅**. Not re-run since; nothing has
changed.

**Device matrix** — the audience is mid-range Android, so that is the primary target, not a
fallback: a 360×640 Android device (smallest realistic), a gesture-nav Pixel (validates P0-4), and
an iPhone with a home indicator.

**Scenarios**

| # | Scenario | How | Watch for |
|---|---|---|---|
| 1 | Cold deep link into a live room | `npx uri-scheme open icn://chautari/<slug> --android` | Title present (P0-2); no crash |
| 2 | Leave and re-enter 5× | Manual | Exactly one token request per entry (P0-1) — check server logs |
| 3 | Slow network | Android Emulator → Cellular → EDGE | Skeletons, no jump, 20s timeout honoured |
| 4 | Reconnect | Airplane mode 10 s mid-room, then off | Reconnecting banner → connected; mic state restored |
| 5 | Mic permission denied | Deny at the OS prompt | Notice + Settings link, no silent revert (P0-7) |
| 6 | Host ends room while listening | Two devices | "Conversation has ended", distinct from network loss (P0-9) |
| 7 | Removed by host | Two devices | "A host removed you" (P0-9) |
| 8 | Crowded room | Seed participants via `lk load-test` (`infra/livekit/load-testing.md`) — **staging only** | ≤16 avatars; scroll stays smooth |
| 9 | Background 2 min | Home, wait, return | Audio continues; state resyncs |
| 10 | Full room | Seed to `max_participants` | Row disabled in list (P0-8) |
| 11 | Reduced motion | OS setting on | Ring does not animate |
| 12 | Dark mode | Toggle | All new surfaces correct in both palettes |

**Instrumented:** React DevTools Profiler during active conversation to verify P1-7 (target: a
speaker change re-renders ≤2 rows, not the whole list).

---

## I. Questions and blockers

Only decisions I should not make alone. Everything else I have recommended and will implement
reversibly.

**Q-1 — Visual direction. This governs the whole redesign.** `tokens.ts:3-15` forbids gradients,
shadows, and decorative motion; the brief asks for Clubhouse/Discord polish. Which?

- **A. Broadsheet, elevated** *(recommended)* — hairlines, type, generous space, avatars as the one
  new visual element. Distinctive; no token changes; low risk.
- **B. Hybrid** — keep the palette and type, allow soft shadows and rounded cards **inside
  Chautari only**. Modern feel; Chautari starts to look like a different app.
- **C. Full social-audio** — gradients, elevation, springy motion. Matches the brief literally;
  abandons the design system and the identity with it.

**Q-2 — Will you extend the discover API?** Three P1/P2 items need it and I will not fake the data:
per-participant host badges, topic chips (`category_id` exists in the DB, unused), and avatar
images (no column anywhere). Each is a small, additive change to
`site/src/app/api/chautari/discover/route.ts` — but that is the **other repository**, and this task
is scoped to `mobile/`. Shall I scope that separately?

**Q-3 — The host entry point.** `HostBar` offers "Open a room" to every signed-in user; only the
server knows about entitlement (`chautari.tsx:136-142`), so most users meet a 403. Options: leave
as is; add an entitlement field to an API response; or hide the button until a first success. This
is product judgement, not style.

**Not blockers — decided and proceeding:** spacing, type scale, avatar sizes, skeleton shapes,
motion durations, and which existing tokens to use.

---

## Recommended first milestone

**P0 only — correctness and misleading states. No visual redesign yet.**

Ten items, all reversible, none touching `site/`, the API contract, LiveKit transport, or
`android.package`. It fixes the three problems in §A, removes the accessibility blockers, and puts
the first tests around `useChautariRoom` — which is what makes the P1 redesign safe to attempt.

**Files involved**

| File | Change |
|---|---|
| `app/chautari/[slug].tsx` | Header with title; safe-area inset; remove-confirm; touch targets; permission notice; disconnect messaging |
| `app/chautari.tsx` | Single-list sections; disable full rooms; pass room context on navigate |
| `src/features/chautari/useChautariRoom.ts` | Stabilise `connect` deps; `DisconnectReason`; permission-error surface |
| `src/lib/api/chautari.ts` | Possibly widen `JoinGrant.room` to carry host/description — **additive only**, no contract break |
| `tests/chautariRoom.test.ts` | **New** — hook coverage |
| `tests/chautariScreens.test.tsx` | **New** — the 0-live/2-upcoming case and the full-room case |
| `docs/chautari-ui-audit.md` | This file |

**Estimated diff:** ~400 lines changed, ~250 added in tests. No new dependency.

---

**Stopped. Awaiting approval before implementing anything.**
Please answer **Q-1** in particular — the visual direction determines the whole of P1.
