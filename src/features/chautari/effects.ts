/**
 * Room sound effects — today, applause.
 *
 * The host or a moderator taps Clap; the server pushes an effect packet into
 * the room on EFFECT_TOPIC and every app plays its own bundled sound
 * (assets/sounds/clap.m4a). The app never sends the packet itself.
 */

/** Must match EFFECT_TOPIC in the site's src/lib/chautari/effects.ts. */
export const EFFECT_TOPIC = "chautari.effect";

export type EffectName = "clap";

export interface EffectPacket {
  type: "effect";
  effect: EffectName;
  /** Who triggered it, for a "Sita clapped" line. */
  by: string;
}

/** Parse a LiveKit data payload; null for anything that is not a known effect. */
export function decodeEffectPacket(payload: Uint8Array): EffectPacket | null {
  try {
    const p = JSON.parse(new TextDecoder().decode(payload)) as Record<string, unknown>;
    if (p.type === "effect" && p.effect === "clap") {
      return {
        type: "effect",
        effect: "clap",
        by: typeof p.by === "string" && p.by.trim() ? p.by.trim().slice(0, 60) : "The host",
      };
    }
  } catch {
    /* not ours */
  }
  return null;
}
