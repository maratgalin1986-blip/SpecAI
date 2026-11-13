// Breadcrumbs of a public page as search engines read them (schema.org
// BreadcrumbList), built from the same trail the page shows (components/
// Breadcrumbs.tsx), so the visible crumbs and the structured data never
// disagree. Lives next to lib/pageMeta.ts: both describe the page to search.

export interface Crumb {
  name: string;
  /** Site path («/arenda/avtokran»); the last crumb is the page itself. */
  path: string;
}

/** The home page: the first crumb of every trail. */
export const HOME_CRUMB: Crumb = { name: 'Главная', path: '/' };

/** schema.org BreadcrumbList with absolute addresses on `base` (siteUrl()). */
export function breadcrumbJsonLd(trail: readonly Crumb[], base: string) {
  const root = base.replace(/\/+$/, '');
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: `${root}${crumb.path}`,
    })),
  };
}
