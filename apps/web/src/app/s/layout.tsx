import type { ReactNode } from 'react';

// A client's site (/s/[slug]) is not a platform page: no catalogue, no menu
// of its own. The platform's header and footer come from the root layout
// (app/layout.tsx) and cannot be removed from here; this layout takes the
// page out of the main column's padding so the site runs edge to edge.
export default function ClientSiteLayout({ children }: { children: ReactNode }) {
  return <div className="-mx-4 -my-6 sm:-mx-6 sm:-my-8">{children}</div>;
}
