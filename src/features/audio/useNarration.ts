import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Platform } from "react-native";
import * as Speech from "expo-speech";
import {
  DEFAULT_CHUNK_LIMIT,
  chunkForSpeech,
  speechLanguageTag,
} from "@/utils/narration";

/**
 * Read an article aloud with the device's own speech engine.
 *
 * Device TTS, not a speech API: it is free, works offline, needs no key and
 * no per-article audio storage, and on both platforms it is already the
 * engine the reader has configured for accessibility. Server-generated audio
 * would mean paying per article per language for something the handset does
 * for nothing.
 *
 * The engine caps one utterance, so the text arrives here pre-chunked and the
 * hook walks the chunks, starting the next from the previous one's `onDone`.
 * That chaining is also what makes pause/resume and stop behave: everything
 * is driven from one index.
 */

export type NarrationStatus = "idle" | "speaking" | "paused" | "unsupported";

export interface Narration {
  status: NarrationStatus;
  /** 0–1 across the whole article, by chunk. */
  progress: number;
  rate: number;
  available: boolean;
  /** True when the reader's language has no installed voice. */
  voiceMissing: boolean;
  play: () => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  setRate: (rate: number) => void;
}

export const NARRATION_RATES = [0.85, 1, 1.25, 1.5] as const;

export function useNarration(text: string, language: "en" | "ne"): Narration {
  const [status, setStatus] = useState<NarrationStatus>("idle");
  const [index, setIndex] = useState(0);
  const [rate, setRateState] = useState(1);
  const [voiceMissing, setVoiceMissing] = useState(false);

  // Web's speechSynthesis behaves differently enough (and the app's web
  // target is a preview, not the product) that narration is simply not
  // offered there rather than offered badly.
  const available = Platform.OS !== "web";

  const chunks = useMemo(
    () => (text ? chunkForSpeech(text, Speech.maxSpeechInputLength || DEFAULT_CHUNK_LIMIT) : []),
    [text],
  );

  /*
   * The index the speak callbacks read.
   *
   * `onDone` fires from native and closes over whatever it captured, so the
   * position lives in a ref and state only mirrors it for rendering.
   */
  const cursor = useRef(0);
  const rateRef = useRef(rate);
  const cancelled = useRef(false);

  useEffect(() => {
    rateRef.current = rate;
  }, [rate]);

  /** Whether a voice for this language is actually installed. */
  useEffect(() => {
    if (!available) return;
    let active = true;
    Speech.getAvailableVoicesAsync()
      .then((voices) => {
        if (!active) return;
        const prefix = language === "ne" ? "ne" : "en";
        setVoiceMissing(!voices.some((v) => v.language?.toLowerCase().startsWith(prefix)));
      })
      .catch(() => {
        // Some engines reject this call outright; assume a voice exists and
        // let `speak` be the thing that fails if it does not.
        if (active) setVoiceMissing(false);
      });
    return () => {
      active = false;
    };
  }, [language, available]);

  /*
   * Chaining one chunk to the next needs `speakFrom` to call itself, and a
   * `useCallback` cannot reference its own binding from inside its body
   * without a temporal-dead-zone hazard the compiler is right to reject.
   * The recursion goes through a ref that is kept pointing at the current
   * callback instead.
   */
  const speakFromRef = useRef<(start: number) => void>(() => {});

  const speakFrom = useCallback(
    (start: number) => {
      if (start >= chunks.length) {
        cursor.current = 0;
        setIndex(0);
        setStatus("idle");
        return;
      }

      cursor.current = start;
      setIndex(start);

      Speech.speak(chunks[start], {
        language: speechLanguageTag(language),
        rate: rateRef.current,
        onDone: () => {
          // A stop() also fires onDone on some engines; the flag keeps a
          // cancelled run from marching on to the next chunk.
          if (cancelled.current) return;
          speakFromRef.current(start + 1);
        },
        onError: () => {
          if (cancelled.current) return;
          setStatus("idle");
        },
      });
      setStatus("speaking");
    },
    [chunks, language],
  );

  useEffect(() => {
    speakFromRef.current = speakFrom;
  }, [speakFrom]);

  const stop = useCallback(() => {
    cancelled.current = true;
    void Speech.stop().catch(() => {});
    cursor.current = 0;
    setIndex(0);
    setStatus("idle");
  }, []);

  const play = useCallback(() => {
    if (!available || chunks.length === 0) return;
    cancelled.current = false;
    speakFrom(0);
  }, [available, chunks.length, speakFrom]);

  const pause = useCallback(() => {
    /*
     * Android's engine has no real pause — `Speech.pause` is iOS-only and
     * throws elsewhere — so pausing there stops and the resume restarts the
     * current chunk. Restarting a sentence is a far better outcome than a
     * control that does nothing.
     */
    if (Platform.OS === "ios") {
      void Speech.pause().catch(() => {});
    } else {
      cancelled.current = true;
      void Speech.stop().catch(() => {});
    }
    setStatus("paused");
  }, []);

  const resume = useCallback(() => {
    if (Platform.OS === "ios") {
      void Speech.resume().catch(() => {});
      setStatus("speaking");
    } else {
      cancelled.current = false;
      speakFrom(cursor.current);
    }
  }, [speakFrom]);

  /** Changing speed restarts the current chunk — the engine cannot retune mid-utterance. */
  const setRate = useCallback(
    (next: number) => {
      setRateState(next);
      rateRef.current = next;
      if (status === "speaking") {
        cancelled.current = true;
        void Speech.stop().catch(() => {});
        cancelled.current = false;
        // Let the native stop settle before starting the replacement.
        setTimeout(() => speakFrom(cursor.current), 60);
      }
    },
    [status, speakFrom],
  );

  /* Never leave a voice reading into an unmounted screen. */
  useEffect(
    () => () => {
      cancelled.current = true;
      void Speech.stop().catch(() => {});
    },
    [],
  );

  /*
   * A new article — or the same one switched to Nepali — means the old
   * narration is over.
   *
   * This is the textbook use for an effect: it stops an external system (the
   * platform speech engine) and brings React's mirror of that system back in
   * step. `set-state-in-effect` guards against effects that re-trigger
   * themselves, which this cannot: it runs only when `text` changes, and it
   * does not write `text`.
   */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    cancelled.current = true;
    void Speech.stop().catch(() => {});
    cursor.current = 0;
    setIndex(0);
    setStatus("idle");
  }, [text]);
  /* eslint-enable react-hooks/set-state-in-effect */

  return {
    status: available ? status : "unsupported",
    progress: chunks.length > 0 ? index / chunks.length : 0,
    rate,
    available,
    voiceMissing,
    play,
    pause,
    resume,
    stop,
    setRate,
  };
}
