import { describe, expect, it } from "vitest";

import * as web from "@/lib/livekit/platform";
import * as native from "@/lib/livekit/platform.native";

/**
 * The LiveKit platform seam.
 *
 * This file exists because of a real crash. `platform.native.ts` used to
 * `import { AudioSession, registerGlobals } from "@livekit/react-native"` at
 * module scope. That package reaches `@livekit/react-native-webrtc`, which
 * throws from its own module body when the WebRTC native module is not in
 * the binary — Expo Go, for instance. Because the import was static and the
 * root layout calls `registerLiveKitGlobals()` at module scope, the throw
 * happened during module-graph evaluation and took down the whole app:
 * Expo Router reported "Cannot read property 'ErrorBoundary' of undefined"
 * and nothing rendered, including reading, which has no live audio in it.
 *
 * Two properties are asserted, and one is deliberately not.
 *
 *  1. Both files export the same surface. TypeScript cannot catch a drift
 *     here: consumers import `@/lib/livekit/platform`, so tsc only ever
 *     resolves the web file and the native one is checked in isolation. A
 *     function added to one and forgotten in the other is a runtime
 *     `undefined is not a function` on exactly one platform.
 *
 *  2. Nothing throws when the native module cannot be resolved. Under
 *     Vitest's ESM runner a bare `require` is undefined, so the guarded
 *     resolve inside the native file always takes its failure path — which
 *     is precisely the Expo Go condition this reproduces.
 *
 * NOT asserted: that live audio works when the module *is* present. That
 * needs the native module and therefore a device build; it cannot be
 * honestly claimed from here.
 */

describe("the two platform files stay in sync", () => {
  it("exports the same names", () => {
    expect(Object.keys(native).sort()).toEqual(Object.keys(web).sort());
  });

  it("exports the same shapes", () => {
    // Indexed through plain records: computed access straight onto an
    // imported namespace is something `import/namespace` cannot validate.
    const w = web as unknown as Record<string, unknown>;
    const n = native as unknown as Record<string, unknown>;
    for (const key of Object.keys(w)) {
      expect(typeof n[key], `export "${key}"`).toBe(typeof w[key]);
    }
    expect(Object.keys(native.audioSession).sort()).toEqual(
      Object.keys(web.audioSession).sort(),
    );
  });
});

describe("native, with no WebRTC module present", () => {
  it("reports live audio as unavailable rather than throwing", () => {
    // The old file could not even be imported in this condition.
    expect(native.isLiveKitAvailable()).toBe(false);
  });

  it("registers globals without throwing", () => {
    expect(() => native.registerLiveKitGlobals()).not.toThrow();
  });

  it("starts and stops the audio session without throwing", async () => {
    await expect(native.audioSession.start()).resolves.toBeUndefined();
    await expect(native.audioSession.stop()).resolves.toBeUndefined();
  });

  it("stays consistent across repeated calls", () => {
    // The resolve is cached on both outcomes; caching must not turn a
    // miss into a throw the second time.
    expect(native.isLiveKitAvailable()).toBe(false);
    expect(native.isLiveKitAvailable()).toBe(false);
    expect(() => native.registerLiveKitGlobals()).not.toThrow();
  });
});

describe("web always has WebRTC", () => {
  it("reports live audio as available", () => {
    // Every browser the app supports ships WebRTC, so there is no
    // equivalent of the native "module not linked" case.
    expect(web.isLiveKitAvailable()).toBe(true);
  });
});
