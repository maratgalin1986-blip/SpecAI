import type { ReactNode } from 'react';

// Preview pages (/preview/[token]) and client sites (/s/[slug]) do without the
// platform's own look inside: the root layout still puts the header, the
// footer and the widgets around every page (they are rendered in
// app/layout.tsx, not here), so this layout only takes the page out of the
// main column's padding so the client's site runs edge to edge.
export default function PreviewLayout({ children }: { children: ReactNode }) {
  return <div className="-mx-4 -my-6 sm:-mx-6 sm:-my-8">{children}</div>;
}
