import { customerRates } from '@/lib/equipmentCatalog';
import { isHouseEquipment } from '@/lib/fleet';
import type { Landing } from '@/lib/landings';
import { LANDINGS } from '@/lib/landings';
import { MACHINE_LABELS } from '@/lib/machinePhotos';
import { fromPerHour, rateOf, rub, SHIFT_HOURS } from '@/lib/prices';
import { SITE } from '@/lib/site';

// City pages /arenda/<slug>/<city> across Russia (owner, 2026-10-17: the
// platform serves the whole country; СпецПласт16 is one provider, based in
// Набережные Челны). Only certain facts live here: the name, its grammatical
// forms, the region and the centre's coordinates (to tell which providers'
// delivery radius reaches the city). Machines and prices come from the
// database (lib/cityFleetData.ts) and are shown only where a provider really
// serves the city; elsewhere the page says that providers are joining and
// offers the order form. No delivery prices: «стоимость подачи назовёт диспетчер».

export interface City {
  slug: string;
  /** «Казань» */
  name: string;
  /** «в Казани» */
  inCity: string;
  /** «по Казани» */
  around: string;
  /** «Республика Татарстан»; the city's own name for Москва and Санкт-Петербург. */
  region: string;
  /** The city centre. */
  lat: number;
  lon: number;
  /**
   * Approximate road distance from СпецПласт16's base, km: set only for the
   * cities its own fleet serves (0 for the base city).
   */
  houseKm?: number;
}

export const BASE_CITY_SLUG = 'naberezhnye-chelny';

type Row = [
  slug: string,
  name: string,
  inCity: string,
  around: string,
  region: string,
  lat: number,
  lon: number,
];

const TATARSTAN = 'Республика Татарстан';
const MOSCOW_REGION = 'Московская область';
const KUZBASS = 'Кемеровская область — Кузбасс';
const UGRA = 'Ханты-Мансийский автономный округ — Югра';

// СпецПласт16's own area: the base city and the towns its fleet drives to.
// prettier-ignore
const HOUSE_AREA: [Row, number][] = [
  [[BASE_CITY_SLUG, 'Набережные Челны', 'в Набережных Челнах', 'по Набережным Челнам', TATARSTAN, 55.7436, 52.3959], 0],
  [['elabuga', 'Елабуга', 'в Елабуге', 'по Елабуге', TATARSTAN, 55.7565, 52.0634], 25],
  [['nizhnekamsk', 'Нижнекамск', 'в Нижнекамске', 'по Нижнекамску', TATARSTAN, 55.6367, 51.8245], 40],
  [['mendeleevsk', 'Менделеевск', 'в Менделеевске', 'по Менделеевску', TATARSTAN, 55.8995, 52.3041], 30],
];

// The largest cities of Russia (about 250 thousand people and more, plus a
// few regional centres close to that), largest first.
// prettier-ignore
const RUSSIA: Row[] = [
  ['moskva', 'Москва', 'в Москве', 'по Москве', 'Москва', 55.7558, 37.6173],
  ['sankt-peterburg', 'Санкт-Петербург', 'в Санкт-Петербурге', 'по Санкт-Петербургу', 'Санкт-Петербург', 59.9343, 30.3351],
  ['novosibirsk', 'Новосибирск', 'в Новосибирске', 'по Новосибирску', 'Новосибирская область', 55.0084, 82.9357],
  ['ekaterinburg', 'Екатеринбург', 'в Екатеринбурге', 'по Екатеринбургу', 'Свердловская область', 56.8389, 60.6057],
  ['kazan', 'Казань', 'в Казани', 'по Казани', TATARSTAN, 55.7963, 49.1088],
  ['krasnoyarsk', 'Красноярск', 'в Красноярске', 'по Красноярску', 'Красноярский край', 56.0153, 92.8932],
  ['nizhnij-novgorod', 'Нижний Новгород', 'в Нижнем Новгороде', 'по Нижнему Новгороду', 'Нижегородская область', 56.3269, 44.0059],
  ['chelyabinsk', 'Челябинск', 'в Челябинске', 'по Челябинску', 'Челябинская область', 55.1644, 61.4368],
  ['ufa', 'Уфа', 'в Уфе', 'по Уфе', 'Республика Башкортостан', 54.7388, 55.9721],
  ['krasnodar', 'Краснодар', 'в Краснодаре', 'по Краснодару', 'Краснодарский край', 45.0355, 38.9753],
  ['samara', 'Самара', 'в Самаре', 'по Самаре', 'Самарская область', 53.1959, 50.1002],
  ['rostov-na-donu', 'Ростов-на-Дону', 'в Ростове-на-Дону', 'по Ростову-на-Дону', 'Ростовская область', 47.2357, 39.7015],
  ['omsk', 'Омск', 'в Омске', 'по Омску', 'Омская область', 54.9885, 73.3242],
  ['voronezh', 'Воронеж', 'в Воронеже', 'по Воронежу', 'Воронежская область', 51.672, 39.1843],
  ['perm', 'Пермь', 'в Перми', 'по Перми', 'Пермский край', 58.0105, 56.2502],
  ['volgograd', 'Волгоград', 'в Волгограде', 'по Волгограду', 'Волгоградская область', 48.708, 44.5133],
  ['saratov', 'Саратов', 'в Саратове', 'по Саратову', 'Саратовская область', 51.5331, 46.0342],
  ['tyumen', 'Тюмень', 'в Тюмени', 'по Тюмени', 'Тюменская область', 57.153, 65.5343],
  ['tolyatti', 'Тольятти', 'в Тольятти', 'по Тольятти', 'Самарская область', 53.5303, 49.3461],
  ['mahachkala', 'Махачкала', 'в Махачкале', 'по Махачкале', 'Республика Дагестан', 42.9849, 47.5047],
  ['barnaul', 'Барнаул', 'в Барнауле', 'по Барнаулу', 'Алтайский край', 53.3548, 83.7698],
  ['izhevsk', 'Ижевск', 'в Ижевске', 'по Ижевску', 'Удмуртская Республика', 56.8526, 53.2045],
  ['habarovsk', 'Хабаровск', 'в Хабаровске', 'по Хабаровску', 'Хабаровский край', 48.4827, 135.0838],
  ['ulyanovsk', 'Ульяновск', 'в Ульяновске', 'по Ульяновску', 'Ульяновская область', 54.3142, 48.4031],
  ['irkutsk', 'Иркутск', 'в Иркутске', 'по Иркутску', 'Иркутская область', 52.287, 104.305],
  ['vladivostok', 'Владивосток', 'во Владивостоке', 'по Владивостоку', 'Приморский край', 43.1155, 131.8855],
  ['yaroslavl', 'Ярославль', 'в Ярославле', 'по Ярославлю', 'Ярославская область', 57.6261, 39.8845],
  ['stavropol', 'Ставрополь', 'в Ставрополе', 'по Ставрополю', 'Ставропольский край', 45.0428, 41.9734],
  ['tomsk', 'Томск', 'в Томске', 'по Томску', 'Томская область', 56.4847, 84.9482],
  ['kemerovo', 'Кемерово', 'в Кемерове', 'по Кемерову', KUZBASS, 55.3547, 86.0873],
  ['orenburg', 'Оренбург', 'в Оренбурге', 'по Оренбургу', 'Оренбургская область', 51.7682, 55.097],
  ['novokuzneck', 'Новокузнецк', 'в Новокузнецке', 'по Новокузнецку', KUZBASS, 53.7596, 87.1216],
  ['ryazan', 'Рязань', 'в Рязани', 'по Рязани', 'Рязанская область', 54.6292, 39.7364],
  ['balashiha', 'Балашиха', 'в Балашихе', 'по Балашихе', MOSCOW_REGION, 55.7963, 37.9382],
  ['penza', 'Пенза', 'в Пензе', 'по Пензе', 'Пензенская область', 53.1959, 45.0183],
  ['cheboksary', 'Чебоксары', 'в Чебоксарах', 'по Чебоксарам', 'Чувашская Республика', 56.1439, 47.2489],
  ['lipeck', 'Липецк', 'в Липецке', 'по Липецку', 'Липецкая область', 52.6088, 39.5992],
  ['kaliningrad', 'Калининград', 'в Калининграде', 'по Калининграду', 'Калининградская область', 54.7104, 20.4522],
  ['astrahan', 'Астрахань', 'в Астрахани', 'по Астрахани', 'Астраханская область', 46.3479, 48.0336],
  ['tula', 'Тула', 'в Туле', 'по Туле', 'Тульская область', 54.1931, 37.6177],
  ['kirov', 'Киров', 'в Кирове', 'по Кирову', 'Кировская область', 58.6036, 49.668],
  ['sochi', 'Сочи', 'в Сочи', 'по Сочи', 'Краснодарский край', 43.5855, 39.7231],
  ['kursk', 'Курск', 'в Курске', 'по Курску', 'Курская область', 51.7304, 36.1926],
  ['ulan-ude', 'Улан-Удэ', 'в Улан-Удэ', 'по Улан-Удэ', 'Республика Бурятия', 51.8335, 107.5841],
  ['tver', 'Тверь', 'в Твери', 'по Твери', 'Тверская область', 56.8587, 35.9176],
  ['magnitogorsk', 'Магнитогорск', 'в Магнитогорске', 'по Магнитогорску', 'Челябинская область', 53.4072, 58.9791],
  ['surgut', 'Сургут', 'в Сургуте', 'по Сургуту', UGRA, 61.254, 73.3962],
  ['bryansk', 'Брянск', 'в Брянске', 'по Брянску', 'Брянская область', 53.2434, 34.3637],
  ['ivanovo', 'Иваново', 'в Иванове', 'по Иванову', 'Ивановская область', 57.0004, 40.9739],
  ['yakutsk', 'Якутск', 'в Якутске', 'по Якутску', 'Республика Саха (Якутия)', 62.0355, 129.6755],
  ['vladimir', 'Владимир', 'во Владимире', 'по Владимиру', 'Владимирская область', 56.129, 40.4066],
  ['belgorod', 'Белгород', 'в Белгороде', 'по Белгороду', 'Белгородская область', 50.5997, 36.5983],
  ['nizhnij-tagil', 'Нижний Тагил', 'в Нижнем Тагиле', 'по Нижнему Тагилу', 'Свердловская область', 57.9101, 59.9813],
  ['chita', 'Чита', 'в Чите', 'по Чите', 'Забайкальский край', 52.034, 113.4994],
  ['arhangelsk', 'Архангельск', 'в Архангельске', 'по Архангельску', 'Архангельская область', 64.5393, 40.5187],
  ['kaluga', 'Калуга', 'в Калуге', 'по Калуге', 'Калужская область', 54.5293, 36.2754],
  ['smolensk', 'Смоленск', 'в Смоленске', 'по Смоленску', 'Смоленская область', 54.7826, 32.0453],
  ['volzhskij', 'Волжский', 'в Волжском', 'по Волжскому', 'Волгоградская область', 48.7858, 44.7797],
  ['murmansk', 'Мурманск', 'в Мурманске', 'по Мурманску', 'Мурманская область', 68.9585, 33.0827],
  ['groznyj', 'Грозный', 'в Грозном', 'по Грозному', 'Чеченская Республика', 43.318, 45.6981],
  ['vologda', 'Вологда', 'в Вологде', 'по Вологде', 'Вологодская область', 59.2181, 39.8886],
  ['cherepovec', 'Череповец', 'в Череповце', 'по Череповцу', 'Вологодская область', 59.1265, 37.9093],
  ['vladikavkaz', 'Владикавказ', 'во Владикавказе', 'по Владикавказу', 'Республика Северная Осетия — Алания', 43.0205, 44.6819],
  ['orel', 'Орёл', 'в Орле', 'по Орлу', 'Орловская область', 52.9703, 36.0635],
  ['podolsk', 'Подольск', 'в Подольске', 'по Подольску', MOSCOW_REGION, 55.4312, 37.5446],
  ['saransk', 'Саранск', 'в Саранске', 'по Саранску', 'Республика Мордовия', 54.1838, 45.1749],
  ['kurgan', 'Курган', 'в Кургане', 'по Кургану', 'Курганская область', 55.441, 65.3411],
  ['tambov', 'Тамбов', 'в Тамбове', 'по Тамбову', 'Тамбовская область', 52.7212, 41.4523],
  ['kostroma', 'Кострома', 'в Костроме', 'по Костроме', 'Костромская область', 57.7677, 40.9264],
  ['sterlitamak', 'Стерлитамак', 'в Стерлитамаке', 'по Стерлитамаку', 'Республика Башкортостан', 53.6301, 55.931],
  ['petrozavodsk', 'Петрозаводск', 'в Петрозаводске', 'по Петрозаводску', 'Республика Карелия', 61.7849, 34.3469],
  ['nizhnevartovsk', 'Нижневартовск', 'в Нижневартовске', 'по Нижневартовску', UGRA, 60.9344, 76.5531],
  ['novorossijsk', 'Новороссийск', 'в Новороссийске', 'по Новороссийску', 'Краснодарский край', 44.7235, 37.7686],
  ['joshkar-ola', 'Йошкар-Ола', 'в Йошкар-Оле', 'по Йошкар-Оле', 'Республика Марий Эл', 56.6344, 47.8999],
  ['himki', 'Химки', 'в Химках', 'по Химкам', MOSCOW_REGION, 55.897, 37.4297],
  ['taganrog', 'Таганрог', 'в Таганроге', 'по Таганрогу', 'Ростовская область', 47.2362, 38.8969],
  ['komsomolsk-na-amure', 'Комсомольск-на-Амуре', 'в Комсомольске-на-Амуре', 'по Комсомольску-на-Амуре', 'Хабаровский край', 50.5499, 137.0079],
  ['syktyvkar', 'Сыктывкар', 'в Сыктывкаре', 'по Сыктывкару', 'Республика Коми', 61.6688, 50.8364],
  ['nalchik', 'Нальчик', 'в Нальчике', 'по Нальчику', 'Кабардино-Балкарская Республика', 43.4853, 43.6071],
  ['shahty', 'Шахты', 'в Шахтах', 'по Шахтам', 'Ростовская область', 47.7085, 40.216],
  ['mytishchi', 'Мытищи', 'в Мытищах', 'по Мытищам', MOSCOW_REGION, 55.9116, 37.7308],
  ['bratsk', 'Братск', 'в Братске', 'по Братску', 'Иркутская область', 56.1514, 101.634],
  ['blagoveshchensk', 'Благовещенск', 'в Благовещенске', 'по Благовещенску', 'Амурская область', 50.2907, 127.5272],
  ['velikij-novgorod', 'Великий Новгород', 'в Великом Новгороде', 'по Великому Новгороду', 'Новгородская область', 58.5228, 31.2699],
  ['dzerzhinsk', 'Дзержинск', 'в Дзержинске', 'по Дзержинску', 'Нижегородская область', 56.2389, 43.4631],
  ['engels', 'Энгельс', 'в Энгельсе', 'по Энгельсу', 'Саратовская область', 51.4986, 46.1262],
  ['orsk', 'Орск', 'в Орске', 'по Орску', 'Оренбургская область', 51.2293, 58.4752],
  ['angarsk', 'Ангарск', 'в Ангарске', 'по Ангарску', 'Иркутская область', 52.5448, 103.8885],
  ['staryj-oskol', 'Старый Оскол', 'в Старом Осколе', 'по Старому Осколу', 'Белгородская область', 51.2967, 37.8417],
  ['korolyov', 'Королёв', 'в Королёве', 'по Королёву', MOSCOW_REGION, 55.9162, 37.8545],
  ['lyubercy', 'Люберцы', 'в Люберцах', 'по Люберцам', MOSCOW_REGION, 55.6783, 37.8932],
  ['pskov', 'Псков', 'в Пскове', 'по Пскову', 'Псковская область', 57.8136, 28.3496],
  ['almetevsk', 'Альметьевск', 'в Альметьевске', 'по Альметьевску', TATARSTAN, 54.9014, 52.2971],
  ['yuzhno-sahalinsk', 'Южно-Сахалинск', 'в Южно-Сахалинске', 'по Южно-Сахалинску', 'Сахалинская область', 46.9591, 142.738],
  ['abakan', 'Абакан', 'в Абакане', 'по Абакану', 'Республика Хакасия', 53.7215, 91.4425],
  ['petropavlovsk-kamchatskij', 'Петропавловск-Камчатский', 'в Петропавловске-Камчатском', 'по Петропавловску-Камчатскому', 'Камчатский край', 53.0452, 158.6483],
  ['pyatigorsk', 'Пятигорск', 'в Пятигорске', 'по Пятигорску', 'Ставропольский край', 44.0486, 43.0594],
  ['majkop', 'Майкоп', 'в Майкопе', 'по Майкопу', 'Республика Адыгея', 44.6098, 40.1006],
  ['norilsk', 'Норильск', 'в Норильске', 'по Норильску', 'Красноярский край', 69.3558, 88.1893],
];

const toCity = ([slug, name, inCity, around, region, lat, lon]: Row, houseKm?: number): City => ({
  slug,
  name,
  inCity,
  around,
  region,
  lat,
  lon,
  ...(houseKm === undefined ? {} : { houseKm }),
});

/** Every city with its own page: СпецПласт16's area first, then the largest cities of Russia. */
export const CITIES: City[] = [
  ...HOUSE_AREA.map(([row, km]) => toCity(row, km)),
  ...RUSSIA.map((row) => toCity(row)),
];

/** The cities СпецПласт16's own fleet serves (its base city included). */
export const HOUSE_CITIES = CITIES.filter((city) => city.houseKm !== undefined);

/** The towns around the base, for «Парк СпецПласт16 работает также: …». */
export const NEARBY_CITIES = HOUSE_CITIES.filter((city) => city.slug !== BASE_CITY_SLUG);

export const DELIVERY_NOTE = 'Стоимость подачи назовёт диспетчер.';

export function cityBySlug(slug: string): City | undefined {
  return CITIES.find((city) => city.slug === slug);
}

export function cityPath(landingSlug: string, citySlug: string): string {
  return `/arenda/${landingSlug}/${citySlug}`;
}

/** Every landing × city pair, for the sitemap. */
export function cityPages(): { slug: string; city: string }[] {
  return LANDINGS.flatMap((landing) =>
    CITIES.map((city) => ({ slug: landing.slug, city: city.slug })),
  );
}

/** Great-circle distance in kilometres. */
export function kmBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The `count` cities nearest to this one (for «Рядом: …» links). */
export function nearestCities(city: City, count = 6): City[] {
  return CITIES.filter((other) => other.slug !== city.slug)
    .map((other) => ({ other, km: kmBetween(city, other) }))
    .sort((a, b) => a.km - b.km)
    .slice(0, count)
    .map(({ other }) => other);
}

/** «база в городе» or «около 25 км от базы в Набережных Челнах». */
export function distanceText(city: City): string {
  return city.houseKm === 0
    ? 'база СпецПласт16 — в самом городе'
    : `около ${city.houseKm} км по дороге от базы в Набережных Челнах`;
}

/** «8 ч × 4 000 ₽ = 32 000 ₽» — hours × rate, computed, never typed by hand. */
export function shiftExample(rate: number, hours: number = SHIFT_HOURS): string {
  return `${hours}\u00a0ч × ${rub(rate)}\u00a0₽ = ${rub(rate * hours)}\u00a0₽`;
}

// ---------------------------------------------------------------------------
// Who serves a city: the honest page model
// ---------------------------------------------------------------------------

/**
 * A provider's delivery radius when the company has none (the same 150 km as
 * ORDER_RADIUS_KM, the radius of new-order alerts).
 */
export const FALLBACK_RADIUS_KM = 150;

/** Company.deliveryRadiusKm's default: СпецПласт16's radius when its row is not loaded. */
export const HOUSE_DEFAULT_RADIUS_KM = 100;

/** СпецПласт16's base when its company has no point on the map: the base city's centre. */
export const HOUSE_BASE = (() => {
  const base = CITIES.find((city) => city.slug === BASE_CITY_SLUG)!;
  return { lat: base.lat, lon: base.lon };
})();

type Amount = number | string | { toString(): string } | null | undefined;

/** One machine as lib/cityFleetData.ts loads it. */
export interface CityFleetRow {
  id: string;
  name: string;
  companyId: string | null;
  hourlyRate?: Amount;
  dailyRate?: Amount;
  company?: {
    name: string;
    baseLat: number | null;
    baseLon: number | null;
    deliveryRadiusKm: number | null;
    /** «Казань, ул. …»: names the city when the company has no point on the map. */
    baseAddress?: string | null;
  } | null;
  location?: { city: string | null; latitude: number | null; longitude: number | null } | null;
}

/** Where a company's fleet is based and how far it goes. */
export interface ServiceArea {
  lat: number;
  lon: number;
  radiusKm: number;
}

function radiusOf(km: number | null | undefined): number {
  return km != null && km > 0 ? km : FALLBACK_RADIUS_KM;
}

const normalize = (text: string) => text.trim().toLowerCase().replace(/ё/g, 'е');

/** Whether an address names the city in any case: «Казань, …», «г. Казани». */
export function addressNamesCity(address: string | null | undefined, city: City): boolean {
  if (!address) return false;
  const text = normalize(address);
  const stems = normalize(city.name)
    .split(/[\s-]+/)
    .map((word) => (word.length > 4 ? word.slice(0, -1) : word));
  return stems.every((stem) => new RegExp(`(^|[^а-яa-z])${stem}`).test(text));
}

/**
 * Whether a machine serves the city: its company's base (or, without one, the
 * machine's own location) lies within the company's delivery radius of the
 * city centre. A row with no point at all counts only in the city its
 * location or its company's base address names. СпецПласт16's machines use
 * its area (`house`).
 */
export function rowServesCity(row: CityFleetRow, city: City, house: ServiceArea): boolean {
  if (isHouseEquipment(row)) return kmBetween(house, city) <= house.radiusKm;
  const company = row.company;
  const point =
    company?.baseLat != null && company.baseLon != null
      ? { lat: company.baseLat, lon: company.baseLon }
      : row.location?.latitude != null && row.location.longitude != null
        ? { lat: row.location.latitude, lon: row.location.longitude }
        : null;
  if (point) return kmBetween(point, city) <= radiusOf(company?.deliveryRadiusKm);
  return (
    Boolean(row.location?.city && normalize(row.location.city) === normalize(city.name)) ||
    addressNamesCity(company?.baseAddress, city)
  );
}

/**
 * СпецПласт16's area from its company row: no point → the base city's centre;
 * no row at all (the database is down) → the default radius.
 */
export function houseArea(
  company?: {
    baseLat: number | null;
    baseLon: number | null;
    deliveryRadiusKm: number | null;
  } | null,
): ServiceArea {
  const base =
    company?.baseLat != null && company.baseLon != null
      ? { lat: company.baseLat, lon: company.baseLon }
      : HOUSE_BASE;
  return {
    ...base,
    radiusKm: company ? radiusOf(company.deliveryRadiusKm) : HOUSE_DEFAULT_RADIUS_KM,
  };
}

export interface CityMachine {
  id: string;
  name: string;
  isHouse: boolean;
  /** What the customer pays per hour with the operator (customerRates). */
  hourlyRate: number;
  /**
   * What a shift costs (customerRates: the provider's own shift price, else
   * SHIFT_HOURS of the hourly one); 0 when the machine has no price.
   */
  shiftRate: number;
}

export type CityOffer =
  | {
      kind: 'available';
      /** The lowest hourly rate on the page; the house price list when its fleet serves the city. */
      fromRate: number | null;
      houseServes: boolean;
      machines: CityMachine[];
    }
  | { kind: 'empty' };

/**
 * What /arenda/<slug>/<city> may promise. Machines only where a provider
 * really serves the city; СпецПласт16's list price only where its own fleet
 * goes. Nobody → `empty`: the page says providers are joining and shows the
 * order form, with no machines, prices or reviews.
 *
 * `houseFleetKnown`: the rows are the whole published fleet of the category,
 * so СпецПласт16 serves the city only with a machine of it. Without the
 * database (false) its list price stands for its area, as the price list does.
 */
export function cityOffer(
  landing: Landing,
  city: City,
  rows: readonly CityFleetRow[],
  house: ServiceArea = houseArea(),
  houseFleetKnown = false,
): CityOffer {
  const machines = rows
    .filter((row) => rowServesCity(row, city, house))
    .map((row) => {
      const rates = customerRates({ ...row, categoryName: landing.title });
      return {
        id: row.id,
        name: row.name,
        isHouse: isHouseEquipment(row),
        hourlyRate: rates.hourlyRate,
        shiftRate: rates.hourlyRate > 0 ? rates.dailyRate : 0,
      };
    })
    // СпецПласт16 first (the owner's rule), then the cheapest; unpriced last.
    .sort(
      (a, b) =>
        Number(b.isHouse) - Number(a.isHouse) ||
        Number(b.hourlyRate > 0) - Number(a.hourlyRate > 0) ||
        a.hourlyRate - b.hourlyRate,
    );
  const houseServes =
    kmBetween(house, city) <= house.radiusKm &&
    (!houseFleetKnown || machines.some((machine) => machine.isHouse));
  if (!houseServes && machines.length === 0) return { kind: 'empty' };
  const rates = [
    ...(houseServes ? [rateOf(landing.machine)] : []),
    ...machines.map((machine) => machine.hourlyRate),
  ].filter((rate) => rate > 0);
  return {
    kind: 'available',
    fromRate: rates.length ? Math.min(...rates) : null,
    houseServes,
    machines,
  };
}

/** The sentence of an empty city page (owner, 2026-10-17). */
export function joiningText(city: City): string {
  return `Исполнители ${city.inCity} подключаются — оставьте заявку, мы найдём технику.`;
}

/**
 * The provider's half of an empty city page: whoever has a machine there can
 * be the first on the line (free, no commission — packages/shared/src/promise.ts),
 * and the page opens to search once a provider serves the city.
 */
export function firstOnLineInvite(city: City): { title: string; text: string; href: string } {
  return {
    title: `Своя техника ${city.inCity}?`,
    text:
      `Встаньте на линию первым — заявки ${city.inCity} и рядом будут приходить вам. ` +
      `Регистрация бесплатная, цену назначаете вы, площадка не берёт процент.`,
    href: '/register?role=provider',
  };
}

const lower = (text: string) => `${text[0]!.toLowerCase()}${text.slice(1)}`;

/** «Казань (Республика Татарстан)»; Москва and Санкт-Петербург alone. */
export function cityWithRegion(city: City): string {
  return city.region === city.name ? city.name : `${city.name} (${city.region})`;
}

/**
 * Two tasks of the machine for this city: the list is rotated by the city's
 * position, so pages of one machine do not repeat the same sentence.
 */
function tasksFor(landing: Landing, city: City): string[] {
  const shift = Math.max(0, CITIES.indexOf(city));
  const tasks = landing.tasks;
  if (tasks.length <= 2) return tasks;
  return [tasks[shift % tasks.length]!, tasks[(shift + 1) % tasks.length]!];
}

export interface CityPageText {
  h1: string;
  title: string;
  description: string;
  intro: string;
}

/** The unique heading, title, description and intro of /arenda/<slug>/<city>. */
export function cityPageText(landing: Landing, city: City, offer: CityOffer): CityPageText {
  const machine = MACHINE_LABELS[landing.machine];
  const tasks = tasksFor(landing, city).map(lower).join('; ');
  const h1 = `Аренда ${landing.title} ${city.inCity} с машинистом`;
  if (offer.kind === 'empty') {
    return {
      h1,
      title: `Аренда ${landing.title} ${city.inCity} — заявка исполнителям`,
      description:
        `${landing.short} с машинистом ${city.around}: ${lower(joiningText(city))} ` +
        `${SITE.platform} — заказ спецтехники по всей России, для заказчика бесплатно.`,
      intro:
        // The joining sentence itself is the page's highlighted line (joiningText).
        `Опишите задачу — например: ${tasks} — и адрес объекта ` +
        `(${cityWithRegion(city)}): заявку увидят диспетчер площадки и исполнители со своей ` +
        `техникой, которые выезжают к вам, и пришлют цены. Машину и цену выбираете вы.`,
    };
  }
  const from = offer.fromRate;
  const where = offer.houseServes
    ? city.houseKm === 0
      ? `${machine} — у исполнителей площадки, в том числе с базы СпецПласт16 ${city.inCity}, без перегона из другого города.`
      : city.houseKm !== undefined
        ? `${city.name} — ${distanceText(city)}: ${lower(machine)} выезжает на объект ${city.inCity} от исполнителей площадки, в том числе из парка СпецПласт16.`
        : `${machine} ${city.inCity} — от исполнителей площадки, в том числе из парка СпецПласт16 в Набережных Челнах.`
    : `${machine} ${city.inCity}${city.region === city.name ? '' : ` (${city.region})`} — от исполнителей площадки, которые работают рядом.`;
  const price = from === null ? '' : ` — ${fromPerHour(from)}`;
  return {
    h1,
    title: `Аренда ${landing.title} ${city.inCity}${price}`,
    description:
      `${landing.short} с машинистом ${city.around}` +
      (offer.houseServes ? ' — СпецПласт16 и другие исполнители' : ' — исполнители площадки') +
      (from === null
        ? '. '
        : `: ${fromPerHour(from)}, смена ${SHIFT_HOURS} ч — от ${rub(from * SHIFT_HOURS)} ₽. `) +
      DELIVERY_NOTE,
    intro: `${where} Например: ${tasks}. ${DELIVERY_NOTE}`,
  };
}

// ---------------------------------------------------------------------------
// FAQ and links of a city page (SEO, 2026-10-28)
// ---------------------------------------------------------------------------

/**
 * Questions and answers of /arenda/<slug>/<city>, also sent as schema.org
 * FAQPage. Only what is true for this city: a price only from the offer (the
 * providers' rates or СпецПласт16's list where its fleet goes), documents with
 * VAT only where СпецПласт16 serves, no invented numbers.
 */
export function cityFaq(
  landing: Landing,
  city: City,
  offer: CityOffer,
): { q: string; a: string }[] {
  const what = `аренда ${landing.title}`;
  const price =
    offer.kind === 'available' && offer.fromRate !== null
      ? `Сейчас на площадке ${city.inCity} — ${fromPerHour(offer.fromRate)}, ` +
        `смена ${SHIFT_HOURS} ч — от ${rub(offer.fromRate * SHIFT_HOURS)} ₽. ` +
        `Цену назначает исполнитель, оплата — по отработанным часам. ${DELIVERY_NOTE}`
      : `Цену назначает исполнитель: оставьте заявку, и исполнители, которые выезжают ` +
        `${city.inCity}, пришлют свои предложения. Сравните и выберите — для заказчика это бесплатно.`;
  const who =
    offer.kind === 'available'
      ? offer.houseServes
        ? `Исполнители площадки, в том числе парк СпецПласт16 из Набережных Челнов. ` +
          `У СпецПласт16 — договор, счёт с НДС и закрывающие документы; условия других ` +
          `исполнителей уточняйте при заказе.`
        : `Исполнители площадки, которые работают ${city.inCity} и рядом (${city.region === city.name ? city.name : city.region}). ` +
          `Условия по договору и НДС уточняйте у выбранного исполнителя.`
      : joiningText(city) +
        ` Заявку увидят исполнители из соседних городов, которые готовы выехать.`;
  return [
    {
      q: `Как заказать ${what.replace('аренда', 'аренду')} ${city.inCity}?`,
      a:
        `Оставьте заявку на этой странице или в разделе «Заявки»: задача, адрес объекта ` +
        `${city.around} и сроки. Её увидят диспетчер ${SITE.platform} и исполнители со своей ` +
        `техникой — они пришлют цены, машину и предложение выбираете вы.`,
    },
    { q: `Сколько стоит ${what} ${city.inCity}?`, a: price },
    { q: `Кто выполняет работы ${city.inCity}?`, a: who },
    {
      q: 'Это платно для заказчика?',
      a: 'Нет. Заявка и подбор техники для заказчика бесплатны, онлайн-оплаты на площадке нет — вы рассчитываетесь с исполнителем напрямую.',
    },
    {
      q: `У меня своя техника ${city.inCity} — как получать заказы?`,
      a:
        `Зарегистрируйтесь как исполнитель и встаньте на линию: заявки ${city.inCity} и рядом ` +
        `будут приходить вам. Регистрация бесплатная, цену назначаете вы.`,
    },
  ];
}

/** The other kinds of machinery in the same city, for «Ещё ${city.inCity}: …» links. */
export function otherLandingsInCity(
  landing: Landing,
  city: City,
): { href: string; label: string }[] {
  return LANDINGS.filter((other) => other.slug !== landing.slug).map((other) => ({
    href: cityPath(other.slug, city.slug),
    label: other.short,
  }));
}
