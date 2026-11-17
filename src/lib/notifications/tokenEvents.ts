/**
 * "This phone's push address was just (re)registered."
 *
 * `push.ts` cannot use Clerk (it is plain async code, called from Settings,
 * the nudge and app launch), but tying the address to the signed-in reader
 * needs a Clerk session. So `push.ts` announces each registration here and
 * `PushAccountLink`, mounted inside the ClerkProvider, does the linking.
 */

type Listener = (token: string) => void;

const listeners = new Set<Listener>();

export function onPushTokenRegistered(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitPushTokenRegistered(token: string): void {
  for (const listener of listeners) listener(token);
}
