// Клиентский сайт «Сайты под ключ» (/s/<slug> и свой домен клиента): на нём не работают
// фирменные мелочи площадки — смена заголовка вкладки, подпись при копировании (BrandPresence),
// кинематографические эффекты и звук (CinemaLayer → CinemaEffects → SoundDirector). На своём
// домене клиента адрес в браузере — «/», поэтому одного пути мало: страница /s/[slug] ставит
// в разметку скрытый маркер `<div data-client-site hidden />`, и компоненты ищут его в документе.

/** Атрибут маркера; страница пишет его буквально: `<div data-client-site hidden />`. */
export const CLIENT_SITE_ATTR = 'data-client-site';
export const CLIENT_SITE_SELECTOR = `[${CLIENT_SITE_ATTR}]`;

/** В документе есть маркер клиентского сайта. Без документа (сервер) — false. */
export function hasClientSiteMarker(
  doc: { querySelector(selector: string): unknown } | null | undefined,
): boolean {
  if (!doc) return false;
  try {
    return doc.querySelector(CLIENT_SITE_SELECTOR) != null;
  } catch {
    return false;
  }
}

/**
 * Площадочные эффекты не нужны: страница из офиса (`standalone` — isStandalonePage(pathname)
 * из components/PublicOnly) или в документе маркер клиентского сайта.
 */
export function offPlatformPage(
  standalone: boolean,
  doc: { querySelector(selector: string): unknown } | null | undefined,
): boolean {
  return standalone || hasClientSiteMarker(doc);
}
