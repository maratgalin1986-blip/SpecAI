import { Fragment } from 'react';
import { breadcrumbJsonLd, type Crumb } from '@/lib/breadcrumbs';
import { siteUrl } from '@/lib/siteUrl';

// The visible crumbs of a page and the same trail as schema.org
// BreadcrumbList (lib/breadcrumbs.ts). Each link is at least 24 px tall, so a
// finger does not have to hit a 19 px line (WCAG 2.5.8).

export function Breadcrumbs({
  trail,
  dark = true,
  className = '',
}: {
  /** From the home page to this page; the last crumb is not a link. */
  trail: readonly Crumb[];
  /** Light text on a dark hero (default) or dark text on the page. */
  dark?: boolean;
  className?: string;
}) {
  const tone = dark ? 'text-slate-400' : 'text-slate-500';
  const hover = dark ? 'hover:text-white' : 'hover:text-slate-900';
  // The structured data sits inside the <nav>: the page's own layout (e.g.
  // .show-seq, which staggers children by position) sees one element.
  return (
    <nav aria-label="Навигационная цепочка" className={`text-sm ${tone} ${className}`}>
      {trail.map((crumb, index) => {
        const last = index === trail.length - 1;
        return (
          <Fragment key={crumb.path}>
            {index > 0 && ' / '}
            {last ? (
              <span aria-current="page">{crumb.name}</span>
            ) : (
              <a href={crumb.path} className={`inline-flex min-h-6 items-center ${hover}`}>
                {crumb.name}
              </a>
            )}
          </Fragment>
        );
      })}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd(trail, siteUrl())) }}
      />
    </nav>
  );
}
