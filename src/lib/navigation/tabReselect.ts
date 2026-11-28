/**
 * "The reader tapped the tab they are already on."
 *
 * The bottom bar is our own (`BottomNav`), not React Navigation's, so its
 * taps don't reach `useScrollToTop` or `tabPress` listeners. Instead it calls
 * `emitTabReselect(href)` and a screen that cares (Home: back to the top
 * story, or refresh when already there) listens with `onTabReselect`.
 * No React here, so it can be tested on its own.
 */

type Listener = () => void;

const listeners = new Map<string, Set<Listener>>();

/** Listen for repeat taps on one tab. Returns the unsubscribe function. */
export function onTabReselect(href: string, listener: Listener): () => void {
  let set = listeners.get(href);
  if (!set) {
    set = new Set();
    listeners.set(href, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/** The bottom bar's tab `href` was tapped while already selected. */
export function emitTabReselect(href: string): void {
  for (const listener of [...(listeners.get(href) ?? [])]) listener();
}
