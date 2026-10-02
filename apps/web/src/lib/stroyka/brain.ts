// A tiny free «mini-AI» for the /stroyka characters: client-side rules, no
// tokens. It understands the visitor's free text (intents + slots), answers in
// the active character's voice, fills the shared order context and decides
// when to pass the visitor on. Business understanding comes from
// lib/dispatcher.ts (matchTask, faqAnswers, findPhone, wantsPrice).

import { faqAnswers, findPhone, matchTask, wantsPrice } from '@/lib/dispatcher';
import { MACHINE_LABELS, type MachineType } from '@/lib/machinePhotos';
import { hourlyRate, PRICES, rub, type SpeakerId } from '@/lib/stroyka';
import { contextFacts, type ContextSet, type OrderContext } from '@/lib/stroyka/context';
import { SAFE_ADVICE, STORIES, type Hazard } from '@/lib/stroyka/lines/stories';
import type { WorkNote } from '@/lib/weather';
import { buildSmeta, type SmetaInput } from '@/lib/smeta';

// ---------------------------------------------------------------- rough estimate (lib/smeta)

const JOB_BY_TASK: [RegExp, string][] = [
  [/транше|коммуникац|водопровод|канализ|кабел/, 'trench'],
  [/котлован|фундамент|септик/, 'pit'],
  [/планиров|выровн|разровн/, 'planning'],
  [/вывоз|вывез|мусор|сыпуч|щеб|песок/, 'haul'],
  [/демонтаж|разбить|снести/, 'demolition'],
  [/плит|ферм|монтаж|кровл/, 'lift'],
  [/блок|поддон|разгруз/, 'kmu'],
  [/фасад|окн|вывеск|высот/, 'height'],
  [/укат|катк|асфальт/, 'compaction'],
  [/снег/, 'snow'],
];
const JOB_BY_MACHINE: Partial<Record<MachineType, string>> = {
  backhoe: 'trench',
  excavator: 'pit',
  'wheeled-excavator': 'demolition',
  crane: 'lift',
  kmu: 'kmu',
  agp: 'height',
  roller: 'compaction',
  truck: 'haul',
  dozer: 'planning',
  loader: 'snow',
  tractor: 'snow',
};

/** The estimate job for the conversation (lib/smeta job ids). */
export function smetaJob(task?: string | null, machine?: MachineType | null): string | null {
  const t = task ? normalize(task) : '';
  const byTask = JOB_BY_TASK.find(([re]) => re.test(t))?.[1];
  return byTask ?? (machine ? (JOB_BY_MACHINE[machine] ?? null) : null);
}

/** «/smeta?job=pit» for the conversation, or the plain calculator. */
export function smetaHref(task?: string | null, machine?: MachineType | null): string {
  const job = smetaJob(task, machine);
  return job ? `/smeta?job=${job}` : '/smeta';
}

const num = (s: string) => Number(s.replace(',', '.'));

/** Sizes in the text: «30 метров», «10 на 8», «глубиной 1,5», «200 м2», «50 кубов». */
export function parseDimensions(text: string): SmetaInput {
  const n = normalize(text.replace(/(\d),(\d)/g, '$1.$2'));
  const out: SmetaInput = {};
  const by =
    /(\d+(?:\.\d+)?)\s*(?:м(?![а-яё\d])|метр[а-яё]*)?\s*(?:на|x|х|\*)\s*(\d+(?:\.\d+)?)/.exec(n);
  if (by) {
    out.length = num(by[1]!);
    out.width = num(by[2]!);
  }
  const depth =
    /(?:глубин[а-яё]*|глубокий|глубокая)\s*(?:до\s*)?(\d+(?:\.\d+)?)/.exec(n) ??
    /(\d+(?:\.\d+)?)\s*(?:м(?![а-яё\d])|метр[а-яё]*)?\s*в\s*глубин/.exec(n);
  if (depth) out.depth = num(depth[1]!);
  const width = /ширин[а-яё]*\s*(\d+(?:\.\d+)?)/.exec(n);
  if (width) out.width = num(width[1]!);
  const explicit = /длин[а-яё]*\s*(\d+(?:\.\d+)?)/.exec(n);
  if (explicit) out.length = num(explicit[1]!);
  else if (out.length === undefined) {
    // The first «N м» that is not the depth.
    for (const m of n.matchAll(/(\d+(?:\.\d+)?)\s*(?:м(?![а-яё\d])|метр[а-яё]*)/g)) {
      const value = num(m[1]!);
      if (value !== out.depth && value !== out.width) {
        out.length = value;
        break;
      }
    }
  }
  const area = /(\d+(?:\.\d+)?)\s*(?:м2|м²|кв\.?\s*м|квадрат[а-яё]*)/.exec(n);
  if (area) {
    out.area = num(area[1]!);
    delete out.length;
  }
  const sotki = /(\d+(?:\.\d+)?)\s*сот/.exec(n);
  if (sotki) out.area = num(sotki[1]!) * 100;
  const volume = /(\d+(?:\.\d+)?)\s*(?:м3|м³|куб[а-яё]*)/.exec(n);
  if (volume) out.volume = num(volume[1]!);
  return out;
}

const rubles = (n: number) => n.toLocaleString('ru-RU');

/** A rough estimate line from the sizes in the text, or null. */
export function roughEstimate(
  text: string,
  task?: string | null,
  machine?: MachineType | null,
): { line: string; job: string } | null {
  const sizes = parseDimensions(text);
  if (!Object.keys(sizes).length) return null;
  const job = smetaJob(task, machine);
  if (!job) return null;
  const smeta = buildSmeta(job, sizes);
  if (!smeta) return null;
  return {
    job,
    line: `Прикинул: ${smeta.job.title.toLowerCase()} — примерно ${rubles(smeta.total)}–${rubles(smeta.totalHigh)} ₽ (${smeta.rows.map((r) => `${r.name.toLowerCase()} ${r.hours} ч`).join(', ')}). Это примерно, точную цену назовёт диспетчер СпецПласт16.`,
  };
}

export type Intent =
  | 'phone'
  | 'order'
  | 'machine'
  | 'price'
  | 'when'
  | 'place'
  | 'weather'
  | 'who'
  | 'joke'
  | 'greeting'
  | 'thanks'
  | 'bye'
  | 'smalltalk'
  | 'faq'
  | 'smeta'
  | 'materials'
  | 'offtopic'
  | 'unknown';

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"“”„!?…,;:()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const CATEGORY_MACHINE: Record<string, MachineType> = {
  'Экскаваторы-погрузчики': 'backhoe',
  Краны: 'crane',
  Самосвалы: 'truck',
  Экскаваторы: 'excavator',
  Манипуляторы: 'kmu',
  Автовышки: 'agp',
  Катки: 'roller',
  Бульдозеры: 'dozer',
  Тракторы: 'tractor',
  Погрузчики: 'loader',
};

/** The machine for the job in the text, via the dispatcher's rules. */
export function machineFor(text: string): MachineType | null {
  const match = matchTask(text);
  if (!match) return null;
  const machine = CATEGORY_MACHINE[match.category] ?? null;
  if (machine === 'excavator' && /молот|демонтаж|разбить|бетон|асфальт/.test(text.toLowerCase()))
    return 'wheeled-excavator';
  return machine;
}

const TASKS: [RegExp, string][] = [
  [/котлован.*фундамент|фундамент/, 'котлован под фундамент'],
  [/септик/, 'котлован под септик'],
  [/транше|водопровод|канализ|кабел|труб/, 'траншея под коммуникации'],
  [/котлован/, 'котлован'],
  [/плит|ферм|монтаж/, 'монтаж плит'],
  [/фасад|окн|вывеск/, 'работы на фасаде'],
  [/кровл|крыш/, 'работы на кровле'],
  [/блок|поддон|разгруз/, 'разгрузка блоков'],
  [/снег/, 'уборка снега'],
  [/покос|косить/, 'покос'],
  [/асфальт|катк|укат/, 'укатка'],
  [/щеб|песок|пгс|отсып/, 'доставка сыпучих'],
  [/мусор|вывез|вывоз/, 'вывоз грунта и мусора'],
  [/планиров|выровн|разровн/, 'планировка участка'],
  [/демонтаж|разбить|снести/, 'демонтаж'],
];

export function taskFor(text: string): string | null {
  const n = normalize(text);
  return TASKS.find(([re]) => re.test(n))?.[1] ?? null;
}

const MSK = 3 * 3_600_000;
const DAY = 86_400_000;
const WEEKDAYS = ['воскресен', 'понедельник', 'вторник', 'сред', 'четверг', 'пятниц', 'суббот'];
const MONTHS = [
  'январ',
  'феврал',
  'март',
  'апрел',
  'ма',
  'июн',
  'июл',
  'август',
  'сентябр',
  'октябр',
  'ноябр',
  'декабр',
];

const isoMsk = (t: number) => new Date(t + MSK).toISOString().slice(0, 10);

/** «завтра», «в пятницу», «15 октября», «через 3 дня» → date (MSK) and a label. */
export function parseWhen(text: string, now: Date): { date: string | null; label: string } | null {
  const n = normalize(text);
  const t = now.getTime();
  if (/послезавтра/.test(n)) return { date: isoMsk(t + 2 * DAY), label: 'послезавтра' };
  if (/завтра/.test(n)) return { date: isoMsk(t + DAY), label: 'завтра' };
  if (/сегодня|сейчас|срочно|прямо сейчас/.test(n)) return { date: isoMsk(t), label: 'сегодня' };
  const inDays = /через (\d+|два|три|пару) (дн|день)/.exec(n);
  if (inDays) {
    const k = { два: 2, три: 3, пару: 2 }[inDays[1] as 'два'] ?? Number(inDays[1]);
    return { date: isoMsk(t + k * DAY), label: `через ${k} дн.` };
  }
  const dm = /\b(\d{1,2})[./](\d{1,2})\b/.exec(n);
  const named =
    /\b(\d{1,2}) (январ|феврал|март|апрел|ма[яй]|июн|июл|август|сентябр|октябр|ноябр|декабр)/.exec(
      n,
    );
  if (dm || named) {
    const day = Number(dm ? dm[1] : named![1]);
    const month = dm ? Number(dm[2]) - 1 : MONTHS.findIndex((m) => named![2]!.startsWith(m));
    const today = new Date(t + MSK);
    let year = today.getUTCFullYear();
    if (month < today.getUTCMonth() || (month === today.getUTCMonth() && day < today.getUTCDate()))
      year++;
    if (month >= 0 && day >= 1 && day <= 31) {
      const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      return {
        date,
        label: `${day} ${['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'][month]}`,
      };
    }
  }
  const wd = WEEKDAYS.findIndex((w) => new RegExp(`(^|\\s)(в|во|на) ${w}`).test(n));
  if (wd >= 0) {
    const today = new Date(t + MSK).getUTCDay();
    const ahead = (wd - today + 7) % 7 || 7;
    const label = [
      'воскресенье',
      'понедельник',
      'вторник',
      'среду',
      'четверг',
      'пятницу',
      'субботу',
    ][wd]!;
    return { date: isoMsk(t + ahead * DAY), label: `в ${label}` };
  }
  if (/выходн/.test(n)) {
    const today = new Date(t + MSK).getUTCDay();
    const ahead = (6 - today + 7) % 7 || 7;
    return { date: isoMsk(t + ahead * DAY), label: 'на выходных' };
  }
  if (/на (этой )?неделе/.test(n)) return { date: null, label: 'на этой неделе' };
  return null;
}

const PLACES =
  /(тукаев\w*|боровецк\w*|сидоровк\w*|елабуг\w*|нижнекамск\w*|менделеевск\w*|заинск\w*|мензелинск\w*|новый город|новом городе|старый город|гэс|зяб\w*|замелекесье|челн\w*)/;

/** A place or address in the text. */
export function parsePlace(text: string): string | null {
  const address =
    /(?:адрес|ул\.?|улица|проспект|пр-т|пр\.|бульвар|переулок|мкр|микрорайон)\s*[:-]?\s*([^,.;]{3,60})/i.exec(
      text,
    );
  if (address) return address[0].replace(/^адрес\s*[:-]?\s*/i, '').trim();
  const n = normalize(text);
  const place = PLACES.exec(n);
  if (!place) return null;
  const word = place[1]!;
  if (/^тукаев/.test(word)) return 'Тукаевский район';
  if (/^челн/.test(word)) return 'Набережные Челны';
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export interface Understanding {
  intents: Intent[];
  set: ContextSet;
  phone: string | null;
  date: string | null;
  faq: string[];
}

export function understand(text: string, now: Date): Understanding {
  const n = normalize(text);
  const intents: Intent[] = [];
  const set: ContextSet = {};
  const phone = findPhone(text);
  if (phone) intents.push('phone');
  const machine = machineFor(n);
  const task = taskFor(n);
  if (machine) {
    set.machine = machine;
    intents.push('machine');
  }
  if (task) set.task = task;
  const when = parseWhen(n, now);
  if (when) {
    set.when = when.label;
    intents.push('when');
  }
  const place = parsePlace(text);
  if (place) {
    set.address = place;
    intents.push('place');
  }
  if (/заказ|оформ|наряд|нужен|нужна|нужно|надо|хочу|аренд|можно ли|возьм/.test(n))
    intents.push('order');
  if (wantsPrice(n)) intents.push('price');
  if (/погод|дожд|ветер|ветр|снег|мороз|прогноз|гроз|туман|жар/.test(n)) intents.push('weather');
  if (/кто (ты|вы|такой|такая)|как (тебя|вас) зовут|ты бот|вы бот|робот|нейросет/.test(n))
    intents.push('who');
  if (/шутк|анекдот|пошути|рассмеш|смешн|истори/.test(n)) intents.push('joke');
  if (/^(привет|здравств|здоров|добр(ый|ое|ого)|салам|хай|приветствую|ку$)/.test(n))
    intents.push('greeting');
  if (/спасиб|благодар|рахмат|спс($|\s)/.test(n)) intents.push('thanks');
  if (/(^|\s)(пока|до свидан|всего добр|до встречи)/.test(n)) intents.push('bye');
  if (/как дела|как жизнь|как работа|чем занят|устал|как настроени/.test(n))
    intents.push('smalltalk');
  if (/смет|посчита|калькул|прикин/.test(n)) intents.push('smeta');
  if (/материал|цемент|кирпич|снабж|поставк|доставк|сколько (песка|щебня)/.test(n))
    intents.push('materials');
  if (/политик|выбор|президент|футбол|хоккей|крипт|биткоин|казино|ставк|гороскоп/.test(n))
    intents.push('offtopic');
  const faq = faqAnswers(n);
  if (faq.length && !intents.includes('when')) intents.push('faq');
  if (!intents.length) intents.push('unknown');
  return { intents, set, phone, date: when?.date ?? null, faq };
}

export interface Quick {
  label: string;
  /** Text sent as if the visitor typed it, or a special action. */
  say?: string;
  action?: 'call' | 'form' | 'order-anyway' | 'other-day' | 'smeta' | 'snab';
}

export interface BrainReply {
  speaker: SpeakerId;
  text: string;
  quick: Quick[];
  set: ContextSet;
  phone: string | null;
  /** Pass the visitor to this character over the radio. */
  handoff?: SpeakerId;
  /** Check the forecast for this machine on this date. */
  checkWeather?: { machine: MachineType; date: string };
}

const QUICK_START: Quick[] = [
  { label: 'Котлован или траншея', say: 'нужно выкопать траншею' },
  { label: 'Поднять груз', say: 'нужен кран поднять плиты' },
  { label: 'Сколько стоит?', say: 'сколько стоит' },
  { label: 'Позвонить', action: 'call' },
];

const FALLBACK: Record<SpeakerId, string[]> = {
  mihalych: [
    'Не расслышал — тут перфоратор. Скажите проще: что делаем и где?',
    'Так, я прораб, а не переводчик. Что строим и когда?',
    'Погоди, бетон шумит. Ещё раз: какая работа и на какой день?',
  ],
  rinat: [
    'Из кабины не расслышал — мотор. Что копаем и где?',
    'Не понял, честно. Траншея, котлован, засыпка? Скажите по-простому.',
  ],
  sveta: [
    'Ой, у меня три телефона звонят. Повторите: что за работа, адрес и когда?',
    'Не уловила. Напишите: какая техника или что сделать — я подберу.',
  ],
  ildar: [
    'Сверху не слышно — ветер. Что поднимаем и куда?',
    'Не понял. Груз какой, вес примерно, на какую высоту?',
  ],
  alsu: [
    'Не расслышала — самосвал сдаёт задом. Какие материалы и сколько?',
    'Я в таблице заблудилась. Напишите: что привезти, куда и когда?',
  ],
};

const WHO: Record<SpeakerId, string> = {
  mihalych:
    'Я Михалыч, прораб. Тридцать лет на объектах, тут всё через меня. Я не бот, я персонаж — но технику подберу по-настоящему.',
  rinat:
    'Ринат, машинист экскаватора-погрузчика. Персонаж, но копаю по-честному: подскажу, что за машина нужна.',
  sveta: 'Света, логист. Я персонаж этой стройки, но заявка от меня уходит настоящему диспетчеру.',
  ildar: 'Ильдар, крановщик. Персонаж, сверху всё вижу. Про краны и подъём — это ко мне.',
  alsu: 'Алсу, снабженец. Персонаж, но материалы и рейсы самосвалов считаю по-настоящему.',
};

const GREET: Record<SpeakerId, string> = {
  mihalych: 'Здорово! Говори, что строим, — подскажу технику.',
  rinat: 'Привет! Что копаем?',
  sveta: 'Здравствуйте! Рассказывайте: что, где и когда.',
  ildar: 'Привет снизу! Что поднимаем?',
  alsu: 'Здравствуйте! Что привезти — песок, щебень, блоки?',
};

const pick = <T>(list: T[], seed: number) => list[Math.abs(seed) % list.length]!;

function priceText(machine?: MachineType): string {
  if (machine) {
    const rate = hourlyRate(machine);
    const extra =
      machine === 'crane'
        ? `, на 32 т — ${rub(PRICES.crane32)} ₽/ч`
        : machine === 'backhoe' || machine === 'wheeled-excavator'
          ? `, с гидромолотом — ${rub(PRICES.hammer)} ₽/ч`
          : '';
    return `${MACHINE_LABELS[machine]} СпецПласт16 — от ${rub(rate)} ₽/ч с машинистом${extra}. Смена 8 часов — ${rub(rate * 8)} ₽.`;
  }
  return `У СпецПласт16: самосвал — ${rub(PRICES.truck)} ₽/ч, автовышка и трактор — ${rub(PRICES.agp)}, автокран — ${rub(PRICES.crane)} (32 т — ${rub(PRICES.crane32)}), остальное — от ${rub(PRICES.other)} ₽/ч. Смена — 8 часов.`;
}

/** The character's answer to free text. */
export function respond(
  text: string,
  speaker: SpeakerId,
  ctx: OrderContext,
  now: Date,
  jokes: string[] = [],
): BrainReply {
  const u = understand(text, now);
  const seed = text.length + now.getMinutes();
  const merged: OrderContext = { ...ctx, ...u.set };
  const has = (i: Intent) => u.intents.includes(i);
  const parts: string[] = [];
  let quick: Quick[] = [];
  let handoff: SpeakerId | undefined;
  let checkWeather: BrainReply['checkWeather'];

  if (u.phone) {
    return {
      speaker: 'sveta',
      text: `Записала номер ${u.phone}. ${contextFacts(merged) ? `По задаче: ${contextFacts(merged)}. ` : ''}Отправляю диспетчеру — подтвердите согласие, и я поставлю в график.`,
      quick: [],
      set: u.set,
      phone: u.phone,
      handoff: speaker === 'sveta' ? undefined : 'sveta',
    };
  }
  const estimate = roughEstimate(text, merged.task, merged.machine);
  if (estimate) {
    return {
      speaker,
      text: estimate.line,
      quick: [
        { label: '🧮 Открыть смету', action: 'smeta' },
        { label: 'Оставить телефон', action: 'form' },
        { label: 'Позвонить', action: 'call' },
      ],
      set: u.set,
      phone: null,
    };
  }
  if (has('smeta') && !u.set.machine) {
    return {
      speaker,
      text: 'Смету прикинем — у нас сметный отдел прямо тут, в вагончике. Скажите размеры — посчитаю примерно, а для материалов есть смета для снабженца.',
      quick: [
        { label: '🧮 Смета для прораба', action: 'smeta' },
        { label: '📦 Смета для снабженца', action: 'snab' },
        { label: 'Оставить телефон', action: 'form' },
      ],
      set: u.set,
      phone: null,
    };
  }
  if (has('materials') && !u.set.machine) {
    return {
      speaker: 'alsu',
      text: 'Материалы — это ко мне, Алсу. Песок привезём самосвалом СпецПласт16, щебень — туда же, считаю рейсы. Список с ценами магазинов — в смете для снабженца.',
      quick: [
        { label: '📦 Смета для снабженца', action: 'snab' },
        { label: 'Доставка — к Свете', action: 'form' },
      ],
      set: u.set,
      phone: null,
      handoff: speaker === 'alsu' ? undefined : 'alsu',
    };
  }
  if (has('machine') || has('order') || has('when') || has('place')) {
    if (u.set.machine) {
      parts.push(
        `У СпецПласт16 есть ${MACHINE_LABELS[u.set.machine].toLowerCase()} — ${matchTask(text)?.why ?? 'подойдёт под задачу'}, подача обычно в день заявки. От ${rub(hourlyRate(u.set.machine))} ₽/ч с машинистом.`,
      );
    } else if (has('price')) parts.push(priceText(merged.machine));
    if (u.set.when) parts.push(`На ${u.set.when.replace(/^(в|на) /, '')} — записал.`);
    if (u.set.address) parts.push(`${u.set.address} — знаем, ездим.`);
    const facts = contextFacts(merged);
    if (merged.machine && u.date) checkWeather = { machine: merged.machine, date: u.date };
    if (merged.machine && merged.when) {
      parts.push('Передаю Свете — она поставит машину в график.');
      handoff = speaker === 'sveta' ? undefined : 'sveta';
      quick = [
        { label: 'Оставить телефон', action: 'form' },
        { label: 'Позвонить', action: 'call' },
      ];
    } else if (merged.machine) {
      parts.push('Когда нужна?');
      quick = [
        { label: 'Сегодня', say: 'сегодня' },
        { label: 'Завтра', say: 'завтра' },
        { label: 'На выходных', say: 'на выходных' },
      ];
    } else {
      parts.push(
        facts
          ? `Понял: ${facts}. Что именно сделать — копать, поднять, вывезти?`
          : 'Что именно сделать — копать, поднять, вывезти?',
      );
      quick = QUICK_START;
    }
  } else if (has('price')) {
    parts.push(priceText(merged.machine));
    quick = [
      { label: 'Оформить наряд', action: 'form' },
      { label: 'Позвонить', action: 'call' },
    ];
  } else if (has('faq')) {
    parts.push(...u.faq);
    quick = QUICK_START;
  } else if (has('weather')) {
    parts.push(
      'Погоду смотрим по прогнозу на день работ — скажите машину и дату, проверю, не помешает ли.',
    );
    quick = QUICK_START;
  } else if (has('who')) {
    parts.push(WHO[speaker]);
    quick = QUICK_START;
  } else if (has('joke')) {
    parts.push(
      jokes.length
        ? pick(jokes, seed)
        : 'Прораб — это человек, который знает, где лопата, но не знает, где рабочий.',
    );
    quick = QUICK_START;
  } else if (has('greeting')) {
    parts.push(GREET[speaker]);
    quick = QUICK_START;
  } else if (has('thanks')) {
    parts.push('Обращайтесь! Техника ждёт, машинисты на связи.');
    quick = [{ label: 'Оформить наряд', action: 'form' }];
  } else if (has('bye')) {
    parts.push('Бывай! Надумаешь — Света на связи, телефон наверху.');
  } else if (has('smalltalk')) {
    parts.push(
      pick(
        [
          'Да как обычно: бетон едет, кран крутится, обед по расписанию. У вас что строим?',
          'Работаем! Смена идёт, техника в деле. Вам что-то нужно на объект?',
        ],
        seed,
      ),
    );
    quick = QUICK_START;
  } else if (has('offtopic')) {
    parts.push(
      'Про это у нас на объекте не спорят — каски не выдерживают. Давайте лучше про технику: что строим?',
    );
    quick = QUICK_START;
  } else {
    parts.push(pick(FALLBACK[speaker], seed));
    quick = QUICK_START;
  }
  return { speaker, text: parts.join(' '), quick, set: u.set, phone: null, handoff, checkWeather };
}

// ---------------------------------------------------------------- weather stories

/** The hazard behind the first warning note from `assessWork`, if any. */
export function hazardOf(notes: Pick<WorkNote, 'level' | 'title'>[]): Hazard | null {
  const note = notes.find((n) => n.level !== 'ok');
  if (!note) return null;
  const t = note.title.toLowerCase();
  if (/ветер|гроза/.test(t)) return 'wind';
  if (/дожд|осадк/.test(t)) return 'rain';
  if (/мороз|гололед|гололёд|холодно|снег/.test(t)) return 'frost';
  if (/туман/.test(t)) return 'fog';
  if (/жара/.test(t)) return 'heat';
  return null;
}

/** A story from life plus the safe advice, with the nearest good day if known. */
export function weatherStory(
  hazard: Hazard,
  machine: MachineType,
  okDay: string | null,
  seed: number,
): { text: string; quick: Quick[] } {
  const story = pick(STORIES[hazard], seed);
  const day = okDay ? ` По прогнозу нормально будет ${okDay} — давайте на этот день?` : '';
  return {
    text: `${story} ${SAFE_ADVICE[hazard]} ${MACHINE_LABELS[machine]} поставим, когда безопасно.${day}`,
    quick: [
      ...(okDay ? [{ label: `На ${okDay}`, say: okDay }] : []),
      { label: 'Другой день', action: 'other-day' as const },
      { label: 'Позвонить диспетчеру', action: 'call' as const },
      { label: 'Всё равно заказать — диспетчер решит', action: 'order-anyway' as const },
    ],
  };
}
