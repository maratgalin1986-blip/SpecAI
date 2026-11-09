// Input shapes of the pure page and call-script builders (lib/office/pages.ts,
// lib/office/scripts.ts). They are deliberately narrower than the Prisma row
// and the niche dictionary: the builders get only what ends up on a page, so
// a token, a note or a status can never leak into the markup by accident (R19).

/** The niche of a prospect, as far as a page needs it. */
export interface PageNiche {
  key: string;
  /** Singular, «Стоматология». */
  title: string;
  /** 5–8 services shown as a list; from the dictionary, never invented. */
  services: string[];
  /**
   * The hero line. May hold `{city}`, written so that the city goes in the
   * nominative: «Лечение зубов без боли в городе {city}». Without a city the
   * builder drops the «в городе {city}» tail.
   */
  heroLine: string;
  accent: 'teal' | 'amber' | 'rose' | 'sky' | 'lime' | 'orange';
}

/** A prospect (a company found on the map), as far as a page needs it. */
export interface PageProspect {
  kind: 'site' | 'provider';
  status: string;
  slug: string;
  name: string;
  phone: string;
  address: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  /** Machine-type slugs separated by commas, spaces or semicolons (provider prospects). */
  tags: string | null;
  /** Opening hours as the source gives them. */
  hours: string | null;
}

/** A machine type: the slug stored in `tags` and its Russian name. */
export interface MachineName {
  slug: string;
  name: string;
}
