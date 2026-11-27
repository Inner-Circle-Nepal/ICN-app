import { useEffect, useState } from "react";

import { playRoomSound, roomSoundPlayer } from "@/lib/audio/roomSound";
import type { EffectPacket } from "./effects";
import type { ChautariRoomState } from "./useChautariRoom";

const CLAP = require("../../../assets/sounds/clap.m4a");

/** How long the "Sita clapped" line stays up. */
const LINE_MS = 3000;

/**
 * Plays the room's sound effects as the server sends them.
 *
 * The sound goes through `roomSound` (see there): one player for the life of
 * the app, set up so that on iPhones it never switches off the audio session
 * LiveKit's call is using. A build without the native module still shows the
 * "clapped" line, just without the sound. The audio mode is never changed
 * here, because changing it mid-call can cut the room's audio.
 * Returns the line to show, e.g. "Sita clapped".
 */
export function useRoomEffects(room: ChautariRoomState): string | null {
  const [line, setLine] = useState<string | null>(null);
  const { onEffectPacket } = room;

  // Load the clap before the first one arrives. The player outlives the screen.
  useEffect(() => {
    roomSoundPlayer(CLAP);
  }, []);

  useEffect(
    () =>
      onEffectPacket((packet: EffectPacket) => {
        if (packet.effect !== "clap") return;
        playRoomSound(CLAP);
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
