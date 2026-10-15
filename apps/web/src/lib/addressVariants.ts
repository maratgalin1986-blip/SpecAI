// How people type an address and how the geocoder wants it: «пр. Мира 10»
// → «проспект Мира 10», and the city when none is named (the site's own).
// Shared by the provider base (providerBase.ts), the address lookup of the
// forms (api/geocode) and the orders' work site (lib/geo.ts findAddress).

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

/** A comma part such as «Москва» or «Нижний Новгород»: no digits, no street words. */
export function namesTown(address: string): boolean {
  return address.split(',').some((part) => {
    const words = part.trim().split(/\s+/).filter(Boolean);
    return (
      words.length > 0 &&
      words.length <= 3 &&
      !/\d/.test(part) &&
      !words.some((word) => STREET_WORD.test(word))
    );
  });
}

/** «пр. Мира 10» → «проспект Мира 10»; without a city the republic is added. */
export function addressVariants(address: string): string[] {
  const expanded = ABBREVIATIONS.reduce(
    (text, [pattern, word]) => text.replace(pattern, word),
    address,
  )
    .replace(/\s+/g, ' ')
    .trim();
  // Without a city the bare street matches anywhere in Russia («пр. Мира 10»
  // is a проезд in Armavir), so the Набережные Челны variant goes first; the
  // caller takes the first variant that lands in the service area.
  const namesCity =
    /татарстан|челны|казан|елабуг|нижнекамск|альметьевск|менделеевск|заинск|бугульм/iu.test(
      expanded,
    );
  // «Казань, ул. Баумана 1» or «Москва, Тверская 3» names its own town (a
  // comma part without digits or street words, also outside the list above);
  // «пр-т Мира, 10» does not, so it is tried in Набережные Челны first.
  const variants =
    namesCity || namesTown(expanded)
      ? [address, expanded]
      : [`${expanded}, Набережные Челны`, expanded, address];
  variants.push(`${expanded}, Республика Татарстан`);
  return [...new Set(variants)];
}
