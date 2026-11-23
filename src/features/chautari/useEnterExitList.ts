import { useEffect, useState } from "react";

import { mergeShown, settleShown, type ShownRow } from "./enterExit";

/**
 * A list's items plus, for `holdMs`, the ones that just left it, each marked
 * entering or leaving so its row can animate (see EnterExit). The data drives
 * everything; this only delays a removal long enough to be seen.
 */
export function useEnterExitList<T>(
  items: readonly T[] | undefined,
  keyOf: (item: T) => string,
  holdMs: number,
): ShownRow<T>[] {
  const [source, setSource] = useState<readonly T[] | undefined>(undefined);
  const [shown, setShown] = useState<ShownRow<T>[]>([]);

  // New data: merge while rendering (the derived-state pattern), not in an effect.
  if (items && items !== source) {
    setSource(items);
    setShown(mergeShown(shown, items, keyOf, source === undefined));
  }

  const animating = shown.some((r) => r.entering || r.leaving);
  useEffect(() => {
    if (!animating) return;
    const t = setTimeout(() => setShown((rows) => settleShown(rows)), holdMs);
    return () => clearTimeout(t);
  }, [animating, shown, holdMs]);

  return shown;
}
