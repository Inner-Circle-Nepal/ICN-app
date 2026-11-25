import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/clerk-expo";
import * as Haptics from "expo-haptics";

import { sendReaction } from "@/lib/api/chautari";
import { MAX_PER_REQUEST, addReaction, FLOAT_MS, type Floater, type ReactionId } from "./reactions";
import type { ChautariRoomState } from "./useChautariRoom";

/** Quick taps of one emoji within this long go to the server as one request. */
const GROUP_MS = 500;

/**
 * The room's reactions: what is floating up the screen, and `react` for the
 * reader's own taps. Their own tap shows at once; the server's batch echoes
 * it back a moment later, so items from this reader are skipped. Taps are
 * grouped (up to MAX_PER_REQUEST per request), and a refusal (over the
 * allowance, a dropped connection) is ignored: a reaction is not worth an
 * error. Must be used inside a ClerkProvider.
 */
export function useRoomReactions(slug: string, room: ChautariRoomState) {
  // LiveKit identities are Clerk user ids, so this is how the echo is recognised.
  const { getToken, userId: me } = useAuth();
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const nextId = useRef(1);
  const pending = useRef(new Map<ReactionId, { count: number; timer: ReturnType<typeof setTimeout> }>());
  const { onReactions } = room;

  const show = useCallback((reaction: ReactionId, count: number) => {
    const id = nextId.current++;
    setFloaters((f) => addReaction(f, reaction, count, Date.now(), id, Math.random()));
  }, []);

  // Everyone else's, in batches from the server.
  useEffect(
    () =>
      onReactions((items) => {
        for (const item of items) if (item.by !== me) show(item.reaction, item.count);
      }),
    [onReactions, me, show],
  );

  // Floaters that have finished are dropped (a render each, not each frame).
  useEffect(() => {
    if (floaters.length === 0) return undefined;
    const t = setTimeout(() => setFloaters((f) => f.filter((x) => Date.now() - x.bornAt < FLOAT_MS)), FLOAT_MS);
    return () => clearTimeout(t);
  }, [floaters]);

  const flush = useCallback(
    (reaction: ReactionId) => {
      const run = pending.current.get(reaction);
      if (!run) return;
      clearTimeout(run.timer);
      pending.current.delete(reaction);
      void sendReaction(getToken, slug, reaction, run.count).catch(() => {});
    },
    [getToken, slug],
  );

  const react = useCallback(
    (reaction: ReactionId) => {
      void Haptics.selectionAsync().catch(() => {});
      show(reaction, 1);
      const run = pending.current.get(reaction);
      if (run) {
        run.count += 1;
        if (run.count >= MAX_PER_REQUEST) flush(reaction);
        return;
      }
      pending.current.set(reaction, { count: 1, timer: setTimeout(() => flush(reaction), GROUP_MS) });
    },
    [show, flush],
  );

  // Leaving the room sends what's left and stops the timers.
  useEffect(() => {
    const runs = pending.current;
    return () => {
      for (const reaction of [...runs.keys()]) flush(reaction);
    };
  }, [flush]);

  return { floaters, react };
}
