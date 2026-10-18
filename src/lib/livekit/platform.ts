/**
 * LiveKit's platform layer — the WEB implementation.
 *
 * Metro picks `platform.native.ts` on iOS and Android and this file on web,
 * so nothing here ever imports `@livekit/react-native`. That matters: that
 * package reaches `requireNativeComponent` through `RTCView`, which
 * `react-native-web` does not export, and importing it anywhere the web
 * bundle evaluates takes the whole app down — including reading, which has
 * nothing to do with live audio.
 *
 * A browser already provides `RTCPeerConnection` and `getUserMedia`, and
 * `livekit-client` uses them directly, so both functions below are no-ops
 * rather than stubs that throw. Chautari works on web through the same hook;
 * it simply has no native audio session to configure.
 *
 * TypeScript resolves this file (it cannot see `.native.ts`), so this is also
 * the type signature both platforms are checked against.
 */

/**
 * Always true on web: every browser this app supports ships WebRTC, so there
 * is no equivalent of the native "module not linked" case.
 *
 * The native file can answer false — see the note there about Expo Go.
 */
export function isLiveKitAvailable(): boolean {
  return true;
}

/** No-op on web: the browser supplies the WebRTC globals itself. */
export function registerLiveKitGlobals(): void {
  /* nothing to register */
}

/**
 * No-op on web: routing, ducking and the speaker/earpiece choice are the
 * browser's and the OS's business, not ours.
 */
export const audioSession = {
  async start(): Promise<void> {},
  async stop(): Promise<void> {},
};
