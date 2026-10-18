/**
 * LiveKit's platform layer — the NATIVE implementation.
 *
 * Metro resolves this file ahead of `platform.ts` on iOS and Android, which
 * is what keeps `@livekit/react-native` out of the web bundle entirely. See
 * the sibling file for why that separation is not optional.
 *
 * Both functions keep the signatures declared there, so the typechecker is
 * checking one contract across both platforms.
 *
 * ## Why the import is lazy
 *
 * `@livekit/react-native` reaches `@livekit/react-native-webrtc`, which
 * throws from its own module body when the WebRTC native module is not
 * linked into the running binary. Expo Go is exactly that case: it ships a
 * fixed set of native modules and WebRTC is not among them.
 *
 * A static `import` here would therefore throw while the module graph is
 * still being evaluated — before React renders anything — and take down the
 * entire app, reading included, on a build that merely happens not to have
 * the module. That is far too wide a blast radius for an optional feature.
 *
 * So the require is deferred and guarded. On a development or production
 * build made with the config plugin, it resolves and everything works. On
 * Expo Go it resolves to `null`, these functions no-op, and
 * `isLiveKitAvailable()` reports false so Chautari can say why rather than
 * failing at connect time with a WebRTC error nobody can act on.
 */

type LiveKitNative = typeof import("@livekit/react-native");

/** `undefined` = not tried yet, `null` = tried and the module is absent. */
let cached: LiveKitNative | null | undefined;

/**
 * Resolve `@livekit/react-native`, once, without letting it throw.
 *
 * Cached on both outcomes: a failed require is expensive and the answer
 * cannot change for the lifetime of the process.
 */
function liveKitNative(): LiveKitNative | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cached = require("@livekit/react-native") as LiveKitNative;
  } catch {
    // No WebRTC native module in this binary — Expo Go, or a build made
    // before the config plugin was added.
    cached = null;
  }
  return cached;
}

/**
 * Whether live audio can actually run in this binary.
 *
 * Chautari screens check this to show an explanation instead of offering a
 * Join button that cannot work.
 */
export function isLiveKitAvailable(): boolean {
  return liveKitNative() !== null;
}

/**
 * Install `RTCPeerConnection`, `MediaStream` and the rest.
 *
 * Must run before any LiveKit code — `livekit-client` reaches for these at
 * import time, so the root layout calls this at module scope rather than in
 * an effect.
 *
 * Silent when the module is absent: the app is expected to keep working
 * everywhere, and the one screen that needs WebRTC asks separately.
 */
export function registerLiveKitGlobals(): void {
  const lk = liveKitNative();
  if (!lk) return;
  try {
    lk.registerGlobals();
  } catch {
    /* Registration is best-effort; a failure here is reported at connect. */
  }
}

export const audioSession = {
  /**
   * Claim the audio route before connecting.
   *
   * On Android a missing session means the call connects and nobody hears
   * anything, which is the hardest kind of bug to report. Failures are
   * swallowed: a device that refuses the session should still let the
   * reader try, and LiveKit will surface a real connection error if one
   * follows.
   */
  async start(): Promise<void> {
    const lk = liveKitNative();
    if (!lk) return;
    try {
      await lk.AudioSession.startAudioSession();
    } catch {
      /* The OS refused or it was already active. */
    }
  },

  async stop(): Promise<void> {
    const lk = liveKitNative();
    if (!lk) return;
    try {
      await lk.AudioSession.stopAudioSession();
    } catch {
      /* Never started, or already reclaimed. */
    }
  },
};
