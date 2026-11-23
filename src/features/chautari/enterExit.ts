/**
 * Keeping items that just left a list on screen long enough to animate out,
 * and marking the ones that just arrived so only they animate in. Pure: the
 * hook in useEnterExitList.ts holds the state.
 */

export interface ShownRow<T> {
  key: string;
  item: T;
  /** Arrived after the list was first shown: animate it in. */
  entering: boolean;
  /** No longer in the data: animate it out, then drop it. */
  leaving: boolean;
}

/**
 * The rows to show for new data. Items keep the data's order; an item that
 * left stays at its old position, marked leaving. On the first data nothing
 * is marked entering, so opening the screen doesn't animate every card.
 */
export function mergeShown<T>(
  shown: readonly ShownRow<T>[],
  items: readonly T[],
  keyOf: (item: T) => string,
  firstLoad: boolean,
): ShownRow<T>[] {
  const before = new Map(shown.map((r) => [r.key, r]));
  const now = new Set(items.map(keyOf));

  const rows: ShownRow<T>[] = items.map((item) => {
    const key = keyOf(item);
    const was = before.get(key);
    return {
      key,
      item,
      entering: firstLoad ? false : was ? was.entering && !was.leaving : true,
      leaving: false,
    };
  });

  // Put each departed row back where it was, so it fades out in place.
  shown.forEach((r, index) => {
    if (now.has(r.key)) return;
    rows.splice(Math.min(index, rows.length), 0, { ...r, entering: false, leaving: true });
  });
  return rows;
}

/** Once the animations have run: departed rows go, arrivals are ordinary rows. */
export function settleShown<T>(shown: readonly ShownRow<T>[]): ShownRow<T>[] {
  return shown.filter((r) => !r.leaving).map((r) => (r.entering ? { ...r, entering: false } : r));
}
