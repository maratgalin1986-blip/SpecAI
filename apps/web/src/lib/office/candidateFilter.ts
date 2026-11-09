// Офис агентов: кого не делать кандидатом (К5, docs/business/sajty-pod-klyuch.md, раздел 9).
// Индивидуальным предпринимателям и людям не пишем: их название — это имя человека, а адрес
// из карточки часто личный (ст. 15 152-ФЗ). Отсеиваем по названию из источника:
// «ИП …», «И.П. …», «индивидуальный предприниматель», ОГРНИП, «(ИП Иванов)» внутри названия,
// и названия, похожие на ФИО: «Иванов Иван Иванович», «Ольга Петровна», «Иванова А. Б.».
// Проверка чистая — её зовёт `run.ts` до создания кандидата, пропуск идёт в `skipped`.

/** Причины пропуска — пишутся после названия: «<название>: <причина>». */
export const CANDIDATE_SKIP_REASONS = {
  entrepreneur: 'индивидуальный предприниматель — не пишем',
  person: 'название похоже на имя человека — не пишем',
} as const;

export type CandidateSkipReason = keyof typeof CANDIDATE_SKIP_REASONS;

const QUOTES = /["«»“”„'`]/g;

/** «ИП …» / «И.П. …» / «И. П. …» в начале названия. */
const IP_START = /^(?:ИП|И\.\s?П\.?)(?=[\s.,]|$)/i;
/** «ИП Иванов» внутри названия: «Шиномонтаж (ИП Иванов)», «Цветы, ИП Сидорова». */
const IP_INSIDE = /(?:^|[^А-ЯЁа-яёA-Za-z])ИП\s+[А-ЯЁ]/;
const IP_WORDS = /индивидуальн\S*\s+предпринимател/i;
const OGRNIP = /огрнип/i;

/** Окончания отчеств. */
const PATRONYMIC = /(?:ович|евич|овна|евна|ична|инична)$/;
/** Слово с заглавной русской буквы, допускается двойная фамилия через дефис. */
const NAME_WORD = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/;
/** «Иванова А. Б.», «Иванова А.Б.» и наоборот «А. Б. Иванова». */
const SURNAME_INITIALS = /^[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.?$/;
const INITIALS_SURNAME = /^[А-ЯЁ]\.\s?[А-ЯЁ]\.\s?[А-ЯЁ][а-яё]+(?:-[А-ЯЁ][а-яё]+)?$/;

/**
 * Слова-вывески: с ними два-три слова с заглавной — название заведения, а не ФИО
 * («Автосервис Петрович», «Кафе Михалыч»). Сравниваются в нижнем регистре.
 */
const BUSINESS_WORDS = new Set([
  'автосервис',
  'автомойка',
  'автомастерская',
  'шиномонтаж',
  'сервис',
  'мастерская',
  'кафе',
  'бар',
  'ресторан',
  'столовая',
  'пекарня',
  'пиццерия',
  'шашлычная',
  'закусочная',
  'бистро',
  'салон',
  'студия',
  'парикмахерская',
  'магазин',
  'лавка',
  'цветы',
  'ателье',
  'клиника',
  'ветклиника',
  'центр',
  'бюро',
  'агентство',
  'компания',
  'фирма',
  'дом',
  'двор',
  'гараж',
  'база',
  'склад',
  'стройматериалы',
  'юрист',
  'бухгалтер',
  'фитнес',
  'спорт',
  'клуб',
]);

function clean(name: string): string {
  return name.replace(QUOTES, ' ').replace(/\s+/g, ' ').trim();
}

/** Похоже ли название на ФИО человека (К5). */
export function looksLikePersonName(raw: string): boolean {
  const name = clean(raw);
  if (!name) return false;
  if (SURNAME_INITIALS.test(name) || INITIALS_SURNAME.test(name)) return true;
  const words = name.split(' ');
  if (words.length < 2 || words.length > 3) return false;
  if (!words.every((w) => NAME_WORD.test(w))) return false;
  if (words.some((w) => BUSINESS_WORDS.has(w.toLowerCase()))) return false;
  return words.some((w) => PATRONYMIC.test(w));
}

/** Индивидуальный предприниматель по названию (К5). */
export function looksLikeEntrepreneur(raw: string): boolean {
  const name = clean(raw);
  if (!name) return false;
  return IP_START.test(name) || IP_INSIDE.test(name) || IP_WORDS.test(name) || OGRNIP.test(name);
}

/** Почему кандидата не берём; null — брать можно. */
export function candidateSkipReason(name: string): CandidateSkipReason | null {
  if (looksLikeEntrepreneur(name)) return 'entrepreneur';
  if (looksLikePersonName(name)) return 'person';
  return null;
}

/** Строка пропуска «<название>: <причина>» или null. */
export function candidateSkipText(name: string): string | null {
  const reason = candidateSkipReason(name);
  return reason ? `${name}: ${CANDIDATE_SKIP_REASONS[reason]}` : null;
}
