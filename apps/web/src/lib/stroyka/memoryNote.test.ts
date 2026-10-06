import { describe, expect, it } from 'vitest';
import { noteDuration, noteVisible, type NoteScreen } from './memoryNote';

const idle: NoteScreen = {
  typing: false,
  orderOpen: false,
  formOpen: false,
  folded: false,
  phone: true,
  expanded: false,
};

describe('memory card on screen', () => {
  it('shows the «Забыть меня» answer over an expanded phone dialogue', () => {
    // «Забыть меня» is pressed inside the expanded box: the answer must show there.
    expect(noteVisible('bye', { ...idle, expanded: true })).toBe(true);
    expect(noteVisible('yes', { ...idle, expanded: true, typing: true })).toBe(true);
  });

  it('keeps the offer away while the visitor is busy or the phone box is open', () => {
    expect(noteVisible('offer', idle)).toBe(true);
    expect(noteVisible('offer', { ...idle, expanded: true })).toBe(false);
    expect(noteVisible('offer', { ...idle, phone: false, expanded: true })).toBe(true);
    for (const busy of ['typing', 'orderOpen', 'formOpen', 'folded'] as const)
      expect(noteVisible('offer', { ...idle, [busy]: true })).toBe(false);
    expect(noteVisible(null, idle)).toBe(false);
  });

  it('keeps the long «Забыть меня» answer at least 10 s', () => {
    expect(noteDuration('bye', 'x'.repeat(260))).toBeGreaterThanOrEqual(10_000);
    expect(noteDuration('bye', 'коротко')).toBe(10_000);
    expect(noteDuration('no', 'Без обид.')).toBe(5_500);
    expect(noteDuration('offer', 'Хотите?')).toBe(null);
  });
});
