import { Playfair_Display } from 'next/font/google';

// A Cyrillic display serif for the chapter names and the credits (never the
// browser's Times fallback). One instance, shared, so it downloads once.
export const displayFont = Playfair_Display({
  subsets: ['cyrillic'],
  weight: ['700', '800'],
  display: 'swap',
  preload: false,
});
