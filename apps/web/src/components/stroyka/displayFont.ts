// The display serif of the /stroyka chapters and credits. It used to come from
// Google Fonts through next/font at build time; that fetch failed the CI
// build twice on 2026-11-09 («Cannot read properties of null» in the Google
// loader) for a page that is no longer in the navigation (owner, 2026-10-15),
// so the build must not depend on Google at all: a system serif stack instead,
// the same shape (`className`) as before for the two callers.
export const displayFont = {
  className: 'font-serif',
} as const;
