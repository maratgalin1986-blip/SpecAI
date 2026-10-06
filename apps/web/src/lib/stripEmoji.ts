// Emojis are for the eyes only: many speechSynthesis engines read «🚜» aloud.
// Tiny on purpose: the sound layer in the root layout imports it.

// Pictographs, their modifiers and joiners, keycaps and flag letters.
const EMOJI_RE =
  /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|\u{FE0E}|\u{FE0F}|\u{200D}|\u{20E3})+/gu;

/** True if the text already has an emoji. */
export function hasEmoji(text: string) {
  EMOJI_RE.lastIndex = 0;
  const found = EMOJI_RE.test(text);
  EMOJI_RE.lastIndex = 0;
  return found;
}

/** Removes emojis (for speech) and tidies the spaces they leave. */
export function stripEmoji(text: string): string {
  return text
    .replace(EMOJI_RE, ' ')
    .replace(/\s+([,.!?…:;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
