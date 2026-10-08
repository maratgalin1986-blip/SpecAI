// When the memory card (offer or the short answer after «Да», «Не сейчас»,
// «Забыть меня») is on screen, and for how long the answers stay. Pure, so
// the phone rules are tested without the page.

export type MemoryNoteMode = 'offer' | 'yes' | 'no' | 'bye';

export interface NoteScreen {
  /** The visitor is typing in the chat. */
  typing: boolean;
  orderOpen: boolean;
  /** Света's order form is on screen. */
  formOpen: boolean;
  /** The offer is folded into its chip. */
  folded: boolean;
  phone: boolean;
  /** The phone dialogue is opened into the full box. */
  expanded: boolean;
}

/**
 * The offer waits while the visitor is busy and never covers an expanded
 * phone dialogue. The answers always show: «Забыть меня» is pressed inside
 * the expanded box, so hiding them there would swallow the confirmation.
 */
export function noteVisible(mode: MemoryNoteMode | null | undefined, s: NoteScreen): boolean {
  if (!mode) return false;
  if (mode !== 'offer') return true;
  return !(s.typing || s.orderOpen || s.formOpen || s.folded) && !(s.phone && s.expanded);
}

/** Milliseconds an answer stays (it also goes on a tap); the offer stays until answered. */
export function noteDuration(mode: MemoryNoteMode, text: string): number | null {
  if (mode === 'offer') return null;
  if (mode === 'bye') return Math.min(18_000, Math.max(10_000, text.length * 55));
  return 5_500;
}
