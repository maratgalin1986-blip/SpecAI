/** [text, space-separated tags]. */
export type RawLine = [string, string];

/** Openers × remarks give natural variety without hand-writing every combination. */
export interface Template {
  openers: string[];
  remarks: RawLine[];
}

/** A two-voice radio exchange. */
export interface RadioPair {
  a: 'mihalych' | 'rinat' | 'sveta' | 'ildar' | 'worker';
  aText: string;
  b: 'mihalych' | 'rinat' | 'sveta' | 'ildar' | 'worker';
  bText: string;
  tags: string;
}
