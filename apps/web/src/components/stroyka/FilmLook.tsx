// The «как в кино» glass over real footage (owner, 2026-10-03: «Графику как в
// кино — сделай акцент»): a soft vignette with a warm halation bloom and teal
// shadows, a faint chromatic fringe, and animated film grain. CSS only (the
// zf-* section of globals.css): static gradients painted once and a tiny
// grain tile moved by steps() transforms, so no per-frame JS and no repaint.
// It goes over the picture and under every text layer; it never takes a tap.
//
// The zone footage is always shot by day, so the site's own clock grades it:
// `tint="night"` is a day-for-night (a blue multiply and lower exposure, so
// the night chapter lines match the picture), `tint="evening"` a soft dusk.

export type FilmTint = 'night' | 'evening' | null;

export function FilmLook({ grain = true, tint = null }: { grain?: boolean; tint?: FilmTint }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {tint === 'night' && (
        <>
          <div data-testid="film-night" className="zf-night absolute inset-0" />
          <div className="zf-night-exposure absolute inset-0" />
        </>
      )}
      {tint === 'evening' && <div className="zf-dusk absolute inset-0" />}
      <div className="zf-glass absolute inset-0" />
      {grain && <div className="zf-grain absolute" />}
    </div>
  );
}
