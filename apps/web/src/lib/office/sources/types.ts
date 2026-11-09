// Источники кандидатов для офисных агентов (spec § 3, R5–R8).
// Минимальные входные типы описаны здесь, чтобы источники не зависели от
// словарей ниш/городов (`lib/office/niches.ts`, `@specai/shared`) — те
// структурно совместимы с этими интерфейсами.

export interface SourceNiche {
  key: string;
  /** Пары тегов OSM: `[['amenity', 'dentist'], ['healthcare', 'dentist']]`. */
  osm: [string, string][];
  /** Для широких тегов (техника): оставлять только объекты, чьё название совпало. */
  nameRegex?: RegExp;
  /** Поисковая фраза для 2ГИС («стоматология», «аренда спецтехники»); без неё 2ГИС не спрашивается. */
  dgisQuery?: string;
  /** Фильтр по названию для самого Overpass (POSIX-регулярка без lookbehind): иначе широкие теги в большом городе не влезают в 25 с. */
  osmNameFilter?: string;
  /** Виды техники по названию и тегам объекта — slug'и из `packages/shared`. */
  machineryTags?: (name: string, tags: Record<string, string>) => string[];
}

export interface SourceCity {
  name: string;
  lat: number;
  lon: number;
}

export interface Candidate {
  name: string;
  /** Всегда в формате `+7XXXXXXXXXX`. */
  phone: string;
  address: string | null;
  lat: number | null;
  lon: number | null;
  hours: string | null;
  website: string | null;
  /** Из тегов `email`/`contact:email`, в нижнем регистре. */
  email: string | null;
  /** Из тега `contact:whatsapp`, формат `+7…`; обычный телефон сюда не подставляется. */
  whatsapp: string | null;
  /** Из тега `contact:telegram`: имя пользователя без «@». */
  telegram: string | null;
  tags: string[];
  /** `osm:<type>/<id>` или `manual:<+7…>` — для дедупликации (R6). */
  sourceRef: string;
}

export type SearchResult =
  { status: 'ok'; candidates: Candidate[] } | { status: 'unavailable'; error: string };

export interface ProspectSource {
  id: string;
  search(input: {
    niche: SourceNiche;
    city: SourceCity;
    radiusKm: number;
    /** Сколько миллисекунд источник может потратить (крон делит своё время между шагами). */
    budgetMs?: number;
    /** Сколько фирм без сайта вернуть (кандидаты); фирмы с сайтом — соседи для досье, без лимита. */
    limit: number;
  }): Promise<SearchResult>;
}
