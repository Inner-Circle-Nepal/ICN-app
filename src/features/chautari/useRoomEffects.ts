import { useEffect, useState } from "react";
import { useAudioPlayer } from "expo-audio";

import type { EffectPacket } from "./effects";
import type { ChautariRoomState } from "./useChautariRoom";

const CLAP = require("../../../assets/sounds/clap.m4a");

/** How long the "Sita clapped" line stays up. */
const LINE_MS = 3000;

/**
 * Plays the room's sound effects as the server sends them.
 *
 * The audio mode is left alone on purpose: expo-audio's default
 * (`mixWithOthers`) plays over the live room instead of interrupting it, and
 * changing the session here could cut the LiveKit audio the reader is
 * listening to. Returns the line to show, e.g. "Sita clapped".
 */
export function useRoomEffects(room: ChautariRoomState): string | null {
  const player = useAudioPlayer(CLAP);
  const [line, setLine] = useState<string | null>(null);
  const { onEffectPacket } = room;

  useEffect(
    () =>
      onEffectPacket((packet: EffectPacket) => {
        if (packet.effect !== "clap") return;
        try {
          // Restart from the top, so a second round isn't lost in the first.
          void player.seekTo(0);
          player.play();
        } catch {
          /* a missing sound must never break the room */
        }
        setLine(`${packet.by} clapped`);
      }),
    [onEffectPacket, player],
  );

  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setLine(null), LINE_MS);
    return () => clearTimeout(t);
  }, [line]);

  return line;
}
