/**
 * "The reader double-tapped the Home tab while already on Home."
 *
 * The tab bar and the Home screen are separate components with no shared
 * parent state, so the tab bar announces the gesture here and the Home screen
 * listens: it scrolls back to the top story and refreshes the feed.
 */
type Listener = () => void;

const listeners = new Set<Listener>();

export function onHomeDoubleTap(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitHomeDoubleTap(): void {
  for (const l of [...listeners]) l();
}

/** Two taps on the active Home tab within this many milliseconds count as a double tap. */
export const DOUBLE_TAP_MS = 400;

let lastTapAt = 0;

/**
 * Record a tap on the Home tab while Home is showing. Returns true (and
 * notifies listeners) when it completes a double tap.
 */
export function registerHomeTabTap(now: number = Date.now()): boolean {
  const isDouble = now - lastTapAt <= DOUBLE_TAP_MS;
  lastTapAt = isDouble ? 0 : now;
  if (isDouble) emitHomeDoubleTap();
  return isDouble;
}
