import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo } from "react-native";
import type { AudioPlayer } from "expo-audio";

import { audioModule } from "@/lib/audio/module";
import type { GiftPacket } from "./gifts";
import type { ChautariRoomState } from "./useChautariRoom";

/** A short, soft bell, well below the clap's loudness (see the vault's note 28). */
const CHIME = require("../../../assets/sounds/gift.m4a");

/** How long one gift stays on screen, animation included. */
export const GIFT_SHOW_MS = 3400;
/** Gifts waiting their turn; beyond this the oldest waiting ones are dropped. */
const MAX_WAITING = 5;

export interface ShownGift {
  /** Unique per arrival, so the same gift twice still animates twice. */
  key: number;
  packet: GiftPacket;
}

/**
 * Gifts as the server announces them to the room, shown one at a time.
 *
 * Everyone in the room sees every gift, the sender included (that's their
 * confirmation). A burst of gifts queues rather than piling up on screen; a
 * long burst drops the oldest waiting ones so the room never shows gifts
 * from a minute ago. Screen readers hear each one announced.
 *
 * Each gift plays the chime as its card appears, so gifts in a burst chime
 * one after another rather than on top of each other. Like the clap, it goes
 * through the guarded audio seam and leaves the audio mode alone, so it
 * plays over the room without interrupting it.
 */
export function useRoomGifts(room: ChautariRoomState): ShownGift | null {
  const { onGiftPacket } = room;
  const [current, setCurrent] = useState<ShownGift | null>(null);
  const waiting = useRef<ShownGift[]>([]);
  const counter = useRef(0);
  const playerRef = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    let player: AudioPlayer | null = null;
    try {
      player = audioModule()?.createAudioPlayer(CHIME) ?? null;
    } catch {
      /* no sound, the card still shows */
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
      onGiftPacket((packet) => {
        counter.current += 1;
        const gift = { key: counter.current, packet };
        AccessibilityInfo.announceForAccessibility(`${packet.by} sent a ${packet.name}`);
        setCurrent((shown) => {
          if (!shown) return gift;
          waiting.current = [...waiting.current, gift].slice(-MAX_WAITING);
          return shown;
        });
      }),
    [onGiftPacket],
  );

  useEffect(() => {
    if (!current) return;
    const player = playerRef.current;
    try {
      if (player) {
        void player.seekTo(0);
        player.play();
      }
    } catch {
      /* a missing sound must never break the room */
    }
    const t = setTimeout(() => {
      const [next, ...rest] = waiting.current;
      waiting.current = rest;
      setCurrent(next ?? null);
    }, GIFT_SHOW_MS);
    return () => clearTimeout(t);
  }, [current]);

  return current;
}
