// When the home page's opening titles (components/IntroSplash.tsx) are not
// played: the visitor came from an ad or a search engine — he asked for
// machinery, not for a film. The patterns are plain strings because the
// inline script that hides the titles before the first paint builds its
// RegExp from them; introSkipped is the same check for tests.

/** Click ids and UTM tags of ads, and the site's own deep links (`?m=`, `?walk=`, `?intro=0`). */
export const SKIP_PARAMS = '[?&](intro=0|m=|walk=|yclid|ysclid|gclid|fbclid|_openstat|utm_[a-z]+=)';

/** A search engine's page as the referrer: Яндекс, Google, Bing, Mail.ru, Rambler and others. */
export const SEARCH_REFERRER =
  '^https?://([a-z0-9-]+\\.)*(yandex|ya|google|bing|mail|rambler|duckduckgo|yahoo)\\.[a-z.]+(/|$)';

export function introSkipped(search: string, referrer: string): boolean {
  return new RegExp(SKIP_PARAMS).test(search) || new RegExp(SEARCH_REFERRER, 'i').test(referrer);
}
