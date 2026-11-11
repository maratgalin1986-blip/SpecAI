// Soft glows behind a section's text, for depth (app/show.css, .show-orb): they
// drift against the scroll in the full show and sit still in the calm one, and
// are hidden without the show. The section needs the class `show-stage`.
export function ShowOrbs({ dark = false }: { dark?: boolean }) {
  return (
    <>
      <span className="show-orb show-orb-a" data-parallax="0.12" aria-hidden />
      <span
        className={`show-orb show-orb-b ${dark ? '' : 'show-orb-cool'}`}
        data-parallax="-0.08"
        aria-hidden
      />
    </>
  );
}
