import type { Metadata } from 'next';
import { SITE } from './site';

// One place that builds the metadata of a public page, so every page carries
// its own og:title, og:description, og:url and og:image. Next does not merge
// `openGraph` between a layout and a page: a page that sets only
// `openGraph: { title }` loses the root image, and a page that sets none
// inherits the home page's og:title. Search and messengers also cut long
// texts, so the helper keeps titles within 65 characters and descriptions
// within 160.

/** The longest <title> that search results show whole. */
export const TITLE_MAX = 65;
/** The longest description that search results show whole. */
export const DESCRIPTION_MAX = 160;

/** The brand as the root layout's title template adds it. */
export const BRAND = `${SITE.platform} от ${SITE.name}`;
const FULL_TAIL = ` · ${BRAND}`;
const SHORT_TAIL = ` · ${SITE.platform}`;

/** The site's default preview picture (app/opengraph-image.png, 1200×630). */
export const DEFAULT_OG_IMAGE = {
  url: '/opengraph-image.png',
  width: 1200,
  height: 630,
  // Only the first letter goes down: «России» keeps its capital.
  alt: `${BRAND} — ${SITE.tagline.charAt(0).toLowerCase()}${SITE.tagline.slice(1)}`,
};

/**
 * The page's <title> within TITLE_MAX: with the full brand when it fits, with
 * the platform name alone when that fits, otherwise the page's own words.
 * The wording itself is never cut: a title longer than TITLE_MAX stays whole
 * (pageMeta.test.ts walks the pages, so such a title is noticed).
 */
export function fitTitle(title: string): string {
  const own = title.trim();
  // Already carries the brand («ИИСтройка24 в Telegram»).
  if (own.includes(SITE.platform)) return own;
  if ((own + FULL_TAIL).length <= TITLE_MAX) return own + FULL_TAIL;
  if ((own + SHORT_TAIL).length <= TITLE_MAX) return own + SHORT_TAIL;
  return own;
}

/** The first wording that fits TITLE_MAX on its own; the last one otherwise. */
export function pickTitle(...candidates: [string, ...string[]]): string {
  return (
    candidates.find((title) => title.length <= TITLE_MAX) ?? candidates[candidates.length - 1]!
  );
}

/** The home page's title: the brand in full when it fits, else the platform's name. */
export const HOME_TITLE = pickTitle(
  `${BRAND} — ${SITE.tagline}`,
  `${SITE.platform} — ${SITE.tagline}`,
);

/**
 * SITE.description for search results (it is 230+ characters): the same
 * promise without the opening brand, which the title already carries, and
 * without the note about the house fleet.
 */
export const HOME_DESCRIPTION = `${SITE.tagline}, ${SITE.promise.toLowerCase()}: одна заявка — цены исполнителей, расчёт напрямую с владельцем техники.`;

/**
 * A description within `max` characters: whole sentences while they fit,
 * otherwise whole words and «…». Facts and prices are not reworded — a
 * sentence either stays or goes.
 */
export function fitDescription(text: string, max = DESCRIPTION_MAX): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  // Sentence ends: «. », «! », «? » — not the dot of «т. д.» or «1.5».
  const sentences = clean.match(/.+?(?:[.!?](?=\s+[А-ЯЁA-Z«\d])|$)\s*/g) ?? [clean];
  let out = '';
  for (const sentence of sentences) {
    if ((out + sentence).trimEnd().length > max) break;
    out += sentence;
  }
  out = out.trimEnd();
  // Sentences that leave a useful snippet; otherwise cut by words.
  if (out.length >= 70) return out;
  const cut = clean.slice(0, max - 1);
  const words = cut.slice(0, Math.max(cut.lastIndexOf(' '), 1)).replace(/[\s,;:—–-]+$/, '');
  return `${words}…`;
}

type OgImage = { url: string; alt?: string; width?: number; height?: number };

export type PageMetaInput = {
  /** The page's own title, without the brand; omit for the site's own title. */
  title?: string;
  description?: string;
  /** The page's own picture (a machine's photo); the site default otherwise. */
  image?: OgImage | null;
  /** og:description when it differs from the meta description. */
  ogDescription?: string;
} & Omit<Metadata, 'title' | 'description' | 'alternates' | 'openGraph' | 'twitter'>;

/**
 * Metadata of the public page at `path` («/», «/arenda/ekskavator»): title
 * and description within the limits, the canonical address, and a full
 * Open Graph/Twitter card with the page's own title, text, address and image.
 */
export function pageMeta(path: string, input: PageMetaInput = {}): Metadata {
  const { title, description, image, ogDescription, ...rest } = input;
  const fullTitle = title ? fitTitle(title) : HOME_TITLE;
  const text = fitDescription(description ?? HOME_DESCRIPTION);
  const cardTitle = title?.trim() ?? fullTitle;
  const cardText = ogDescription ? fitDescription(ogDescription, 300) : text;
  const picture = image ?? DEFAULT_OG_IMAGE;
  return {
    ...rest,
    title: { absolute: fullTitle },
    description: text,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      siteName: BRAND,
      title: cardTitle,
      description: cardText,
      url: path,
      images: [picture],
    },
    twitter: {
      card: 'summary_large_image',
      title: cardTitle,
      description: cardText,
      images: [picture.url],
    },
  };
}
