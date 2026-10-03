// The «как в кино» glass over real footage (owner, 2026-10-03: «Графику как в
// кино — сделай акцент»): a soft vignette with a warm halation bloom and teal
// shadows, a faint chromatic fringe, and animated film grain. CSS only (the
// zf-* section of globals.css): static gradients painted once and a tiny
// grain tile moved by steps() transforms, so no per-frame JS and no repaint.
// It goes over the picture and under every text layer; it never takes a tap.

export function FilmLook({ grain = true }: { grain?: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="zf-glass absolute inset-0" />
      {grain && <div className="zf-grain absolute" />}
    </div>
  );
}
