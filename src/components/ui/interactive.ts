/**
 * Einheitliches Aussehen für alles, was auf eine andere Ansicht führt: sichtbarer Hover,
 * sichtbarer Tastaturfokus. Den Zeiger als Cursor bringen Links von sich aus mit.
 */

/** Link im Fließtext oder in einer Tabellenzelle. */
export const inlineLinkClass =
  "rounded-sm underline-offset-4 transition-colors hover:text-primary hover:underline " +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

/** Ganze Zeile einer Liste als Link – ragt links und rechts leicht über den Text hinaus. */
export const rowLinkClass =
  "-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm transition-colors " +
  "hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-ring";

/**
 * Macht den umgebenden Kasten (`relative`) als Ganzes anklickbar: der Link selbst bleibt kurz
 * beschriftet, seine Fläche deckt den Kasten ab.
 */
export const stretchedLinkClass =
  "rounded-sm after:absolute after:inset-0 after:rounded-[inherit] " +
  "focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring";
