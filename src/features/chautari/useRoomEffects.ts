import { useEffect, useRef, useState } from "react";
import type { AudioPlayer } from "expo-audio";

import { audioModule } from "@/lib/audio/module";
import type { EffectPacket } from "./effects";
import type { ChautariRoomState } from "./useChautariRoom";

const CLAP = require("../../../assets/sounds/clap.m4a");

/** How long the "Sita clapped" line stays up. */
const LINE_MS = 3000;

/**
 * Plays the room's sound effects as the server sends them.
 *
 * expo-audio is reached through its guarded seam, so a build without the
 * native module still shows the "clapped" line, just without the sound. The
 * player is created once per room screen (so the sound is loaded before the
 * first clap) and released when it goes.
 *
 * The audio mode is left alone on purpose: expo-audio's default
 * (`mixWithOthers`) plays over the live room instead of interrupting it, and
 * changing the session here could cut the LiveKit audio the reader is
 * listening to. Returns the line to show, e.g. "Sita clapped".
 */
export function useRoomEffects(room: ChautariRoomState): string | null {
  const playerRef = useRef<AudioPlayer | null>(null);
  const [line, setLine] = useState<string | null>(null);
  const { onEffectPacket } = room;

  useEffect(() => {
    let player: AudioPlayer | null = null;
    try {
      player = audioModule()?.createAudioPlayer(CLAP) ?? null;
    } catch {
      /* no sound, the line still shows */
    }
    playerRef.current = player;
    return () => {
      playerRef.current = null;
      try {
        player?.remove();
      } catch {
        /* already gone */
      }
    };
  }, []);

  useEffect(
    () =>
      onEffectPacket((packet: EffectPacket) => {
        if (packet.effect !== "clap") return;
        const player = playerRef.current;
        try {
          // Restart from the top, so a second round isn't lost in the first.
          if (player) {
            void player.seekTo(0);
            player.play();
          }
        } catch {
          /* a missing sound must never break the room */
        }
        setLine(`${packet.by} clapped`);
      }),
    [onEffectPacket],
  );

  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setLine(null), LINE_MS);
    return () => clearTimeout(t);
  }, [line]);

  return line;
}
