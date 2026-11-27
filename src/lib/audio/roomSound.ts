import { Platform } from "react-native";
import type { AudioPlayer } from "expo-audio";

import { audioModule } from "./module";

/**
 * Short sounds played over a live Chautari room (the gift chime, the clap).
 *
 * They share the phone's audio with LiveKit's call, and expo-audio's default
 * handling of that audio is wrong for a call in progress:
 *
 * - **iOS.** expo-audio activates the shared `AVAudioSession` to play, and
 *   deactivates it again when the sound ends or its player is removed. That
 *   session is the one LiveKit's call runs on, so the room went silent on
 *   iPhones a moment after every gift. `keepAudioSessionActive` stops
 *   expo-audio from ever deactivating it; LiveKit stays in charge of the
 *   session's lifetime.
 * - **Android.** expo-audio asks for transient audio focus to play. LiveKit
 *   ignores the loss and its call carries on (checked on a phone, 2026-11-27),
 *   so nothing is changed there. `keepAudioSessionActive` would be harmful on
 *   Android: the chime would keep the focus for good.
 *
 * Each player is created once and kept for the life of the app, never
 * removed: removing a player is another point where iOS deactivates the
 * session, and a reader can leave the room screen while the room keeps
 * playing (the mini bar). One player per sound is a few kilobytes.
 *
 * `null` when the native module is missing (an old build), so the room
 * carries on silently.
 */
const players = new Map<number, AudioPlayer | null>();

export function roomSoundPlayer(source: number): AudioPlayer | null {
  if (players.has(source)) return players.get(source) ?? null;
  let player: AudioPlayer | null = null;
  try {
    player =
      audioModule()?.createAudioPlayer(source, {
        keepAudioSessionActive: Platform.OS === "ios",
      }) ?? null;
  } catch {
    player = null;
  }
  players.set(source, player);
  return player;
}

/** Play from the top, so a second sound isn't lost in the first. Never throws. */
export function playRoomSound(source: number): void {
  const player = roomSoundPlayer(source);
  if (!player) return;
  try {
    void player.seekTo(0);
    player.play();
  } catch {
    /* a missing sound must never break the room */
  }
}
