/**
 * Initials for a participant avatar.
 *
 * Its own module, free of any `react-native` import, so it can be tested
 * under vitest's node environment — importing a component would pull in
 * `react-native/index.js`, which is Flow-typed and cannot be parsed there.
 * That is the same reason this repo has no component tests.
 *
 * The input is whatever reached `chautari_participants.display_name`: a
 * name the client supplied (the server bounds it to 60 characters and
 * otherwise does not validate it), or — when that column is null — the
 * opaque user id the hook falls back to.
 */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}
