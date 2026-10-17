// How people type an address and how the geocoder wants it: «пр. Мира 10»
// → «проспект Мира 10», and the town around the user when none is named.
// Shared by the provider base (providerBase.ts), the address lookup of the
// forms (api/geocode) and the orders' work site (lib/geo.ts findAddress).

import { findCityInText } from '@specai/shared';

// `\b` knows only Latin letters, so the boundaries are spelled out.
const ABBREVIATIONS: [RegExp, string][] = [
  // With or without the dot: «ул. Мира», «ул Мира», «пр-т Мира», «пр Мира».
  [/(?<![\p{L}-])(?:пр-т|просп\.?|пр\.?)(?=\s)/giu, 'проспект'],
  [/(?<![\p{L}-])ул\.?(?=\s)/giu, 'улица'],
  [/(?<![\p{L}-])пер\.?(?=\s)/giu, 'переулок'],
  [/(?<![\p{L}-])(?:б-р|бул\.?)(?=\s)/giu, 'бульвар'],
  [/(?<![\p{L}-])ш\.(?=\s)/giu, 'шоссе'],
  [/(?<![\p{L}-])д\.\s*(?=\d)/giu, ''],
  [/(?<![\p{L}-])г\.\s*(?=\p{Lu})/giu, ''],
];

const STREET_WORD =
  /^(ул|улица|пр|просп|проспект|пер|переулок|б-р|бул|бульвар|ш|шоссе|наб|набережная|пл|площадь|проезд|тракт|тупик|аллея|линия|квартал|мкр|микрорайон|комплекс|посёлок|поселок|снт|д|дом|корп|стр|к)\.?$/iu;

/**
 * A comma part such as «Москва» or «Нижний Новгород»: no digits, no street
 * words. A bare word without a comma («Мира», «Тверская») is a street the
 * visitor typed without the city, not a town, so the town around the user is
 * added to it when known.
 */
export function namesTown(address: string): boolean {
  const parts = address.split(',');
  if (parts.length < 2) return false;
  return parts.some((part) => {
    const words = part.trim().split(/\s+/).filter(Boolean);
    return (
      words.length > 0 &&
      words.length <= 3 &&
      !/\d/.test(part) &&
      !words.some((word) => STREET_WORD.test(word))
    );
  });
}

function expand(address: string): string {
  return ABBREVIATIONS.reduce((text, [pattern, word]) => text.replace(pattern, word), address)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Whether the text already says where: a known city («в Казани», «Москва,
 * Тверская 3»), a region or a district, or a town in a comma part.
 */
export function namesPlace(address: string): boolean {
  const expanded = expand(address);
  return (
    findCityInText(expanded, { address: true }) !== null ||
    /(?<!\p{L})(?:област|кра[йюе]|республик|район|округ)/iu.test(expanded) ||
    namesTown(expanded)
  );
}

/**
 * «пр. Мира 10» → «проспект Мира 10». An address without a town gets the
 * bias city first (`city`: the town around the user or of the order) when one
 * is known; without it the bare street is searched across Russia — never in
 * a default town.
 */
export function addressVariants(
  address: string,
  city?: string | null,
  /** namesPlace(address), when the caller has it already. */
  named: boolean = namesPlace(address),
): string[] {
  const expanded = expand(address);
  const town = city?.trim();
  const variants = named
    ? [address, expanded]
    : town
      ? [`${expanded}, ${town}`, expanded, address]
      : [expanded, address];
  return [...new Set(variants)];
}
