// Moods and emojis for the /stroyka characters. Pure: the speech bubbles, the
// dialogue box, the portraits, the voxel faces and the voices all read the
// same verdict. Emojis are display-only; stripEmoji() keeps them out of
// speechSynthesis, which reads them aloud in many browsers.

import { hasEmoji, stripEmoji } from '@/lib/stripEmoji';

export type Mood =
  | 'neutral'
  | 'happy'
  | 'laugh'
  | 'angry'
  | 'surprised'
  | 'thinking'
  | 'tired'
  | 'proud'
  | 'worried'
  | 'radio';

export const MOODS: Mood[] = [
  'neutral',
  'happy',
  'laugh',
  'angry',
  'surprised',
  'thinking',
  'tired',
  'proud',
  'worried',
  'radio',
];

export type LineKind = 'business' | 'joke' | 'radio';

export interface MoodInput {
  speaker: string;
  text: string;
  kind: LineKind;
  /** Moscow hour, 0–23: adds 🌙 to night lines. */
  hour?: number;
  /** The line's tags (lines/index.ts): only a «joke» gets a laughing face. */
  tags?: string[];
}

export interface MoodResult {
  mood: Mood;
  /** At most 2 (1 for business and radio lines), in display order. */
  emojis: string[];
}

/** Comic swearing: a run of #@%&$*! with at least one symbol other than «!». */
const CENSORED = /[#@%&$*!]*[#@%&$*][#@%&$*!]*/;

// Topic words as lower-case stems (Cyrillic has no \b in JS regexes).
const T = {
  thanks: /спасиб|благодар/,
  confirm:
    /заявк\S* (принят|отправ|ушл)|принял[аи]? заявк|наряд (оформлен|принят|собран)|подтвержда|записал[аи]?:|приняла,|принято[.!]/,
  greet:
    /здравств|здорово!|привет|добро пожаловать|добр(ый|ое|ого) (день|утр|вечер)|заходи|рад(а)? видеть/,
  laughCue: /ха-ха|хаха|ржу|смешн|анекдот|шутк/,
  surprised: /\?!|!\?|(^|[\s«])ого[,!. ]|ничего себе|вот это да|неужели|ух ты|в шоке/,
  thinking: /хм+[.,!]|думаю|подумать|философ|интересно|задумал|прикидыва/,
  tired: /устал|спать|зева|сил нет|по спине|конец смены|еле /,
  proud: /горжусь|лучш(ий|е)|могу[.!]|мой jcb|как часы|аккуратно, как|ровн(ую|ая) траншею|вовремя/,
  thunder: /гроз|молни|гром/,
  rain: /дожд|ливн|ливен|лужи|грязь|грязи|плащ/,
  snow: /снег|снеж|мороз|метел|зимой|гололёд|сугроб/,
  wind: /ветер|ветр|порыв/,
  fog: /туман/,
  night: /ночь|ночн|ночью|сторож|луна|темно|прожектор/,
  coffee: /обед|перекур|(^|[\s«(])ча[йюя]|кофе|перерыв|термос|чак-чак|бутерброд/,
  radio: /приём|прием|кшш|рация|рацию|в эфире/,
  price: /₽|руб\.|рубл|цен[аеыу]|стоимост|прайс|(^|[\s«(])ставк|почём|почем|сколько стоит/,
  measure: /размер|замер|площад|кубатур|кубов|кубы|метр/,
  estimate: /смет|прикин|посчита|расчёт|расчет|калькулят/,
  dig: /экскаватор|ковш|jcb|погрузчик|трактор|бульдозер|каток|траншею|траншея|котлован|копа/,
  crane: /кран|стрел[аеуы]|вира|майна|плит[аыу]|манипулятор|кму|автовышк|стропал/,
  truck: /самосвал|рейс|грузовик|доставк|фур[аеуы]/,
  brick: /кирпич|блок|бетон|песок|песка|щеб[её]н|материал|арматур|цемент|поддон|раствор/,
};

/** Emojis the page may show: friendly, no flags, nothing that could offend. */
export const EMOJIS = {
  happy: '😄',
  laugh: '😂',
  angry: '🤬',
  surprised: '😮',
  thinking: '🤔',
  tired: '😴',
  proud: '💪',
  foreman: '👷',
  dig: '🚜',
  crane: '🏗️',
  truck: '🚛',
  brick: '🧱',
  price: '💰',
  measure: '📐',
  estimate: '🧮',
  rain: '🌧️',
  snow: '❄️',
  wind: '💨',
  thunder: '⛈️',
  fog: '🌫️',
  night: '🌙',
  coffee: '☕',
  radio: '📻',
  thanks: '🙏',
  confirm: '✅',
} as const;

/** Calm enough for a business line (never a face). */
const CALM = new Set<string>([
  EMOJIS.foreman,
  EMOJIS.dig,
  EMOJIS.crane,
  EMOJIS.truck,
  EMOJIS.brick,
  EMOJIS.price,
  EMOJIS.measure,
  EMOJIS.estimate,
  EMOJIS.rain,
  EMOJIS.snow,
  EMOJIS.wind,
  EMOJIS.thunder,
  EMOJIS.fog,
  EMOJIS.night,
  EMOJIS.coffee,
  EMOJIS.radio,
  EMOJIS.thanks,
  EMOJIS.confirm,
]);

/** Emojis that open a line rather than close it. */
const LEADING = new Set<string>([EMOJIS.foreman, EMOJIS.radio]);

function hash(text: string) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The mood of a line and 0–2 emojis that fit its topic. */
export function moodOf({ speaker, text, kind, hour, tags }: MoodInput): MoodResult {
  const t = text.toLowerCase();
  const joke = kind === 'joke' && (!tags || tags.includes('joke'));
  const night = T.night.test(t) || (hour !== undefined && (hour >= 22 || hour < 5));

  // Topic emojis, most specific first.
  const topic: string[] = [];
  if (T.thunder.test(t)) topic.push(EMOJIS.thunder);
  else if (T.snow.test(t)) topic.push(EMOJIS.snow);
  else if (T.rain.test(t)) topic.push(EMOJIS.rain);
  if (T.wind.test(t)) topic.push(EMOJIS.wind);
  if (T.fog.test(t)) topic.push(EMOJIS.fog);
  if (T.price.test(t)) topic.push(EMOJIS.price);
  if (T.estimate.test(t)) topic.push(EMOJIS.estimate);
  else if (T.measure.test(t) && kind === 'business') topic.push(EMOJIS.measure);
  if (T.crane.test(t)) topic.push(EMOJIS.crane);
  if (T.dig.test(t)) topic.push(EMOJIS.dig);
  if (T.truck.test(t)) topic.push(EMOJIS.truck);
  if (T.brick.test(t)) topic.push(EMOJIS.brick);
  if (T.coffee.test(t)) topic.push(EMOJIS.coffee);
  if (night) topic.push(EMOJIS.night);
  const weather = topic.some((e) =>
    [EMOJIS.thunder, EMOJIS.snow, EMOJIS.rain, EMOJIS.wind, EMOJIS.fog].includes(e as never),
  );

  // The mood, strongest cue first.
  let mood: Mood = 'neutral';
  let face: string | null = null;
  if (CENSORED.test(text)) {
    mood = 'angry';
    face = EMOJIS.angry;
  } else if (kind === 'radio' || T.radio.test(t)) {
    mood = 'radio';
  } else if (T.thanks.test(t)) {
    mood = 'happy';
    face = EMOJIS.thanks;
  } else if (T.confirm.test(t)) {
    mood = 'proud';
    face = EMOJIS.confirm;
  } else if (T.surprised.test(t)) {
    mood = 'surprised';
    face = EMOJIS.surprised;
  } else if (speaker === 'mihalych' && T.greet.test(t)) {
    mood = 'happy';
    face = EMOJIS.foreman;
  } else if (weather && !joke) {
    mood = 'worried';
  } else if (joke && (T.laughCue.test(t) || hash(text) % 3 === 0)) {
    mood = 'laugh';
    face = EMOJIS.laugh;
  } else if (T.tired.test(t) || (night && kind !== 'business')) {
    mood = 'tired';
    face = T.tired.test(t) ? EMOJIS.tired : null;
  } else if (T.proud.test(t)) {
    mood = 'proud';
    face = kind === 'business' ? null : EMOJIS.proud;
  } else if (T.thinking.test(t)) {
    mood = 'thinking';
    face = kind === 'business' ? null : EMOJIS.thinking;
  } else if (joke) {
    mood = 'happy';
    face = EMOJIS.happy;
  } else if (T.greet.test(t)) {
    mood = 'happy';
  }

  let emojis: string[];
  if (kind === 'business') {
    // One calm emoji at most: the confirmation or greeting, else the topic.
    const pick = [face, ...topic].find((e): e is string => !!e && CALM.has(e));
    emojis = pick ? [pick] : [];
  } else if (mood === 'radio') {
    // 📻 on a call («приём»), else the topic: no 📻 on every line of the log.
    const call = T.radio.test(t) ? EMOJIS.radio : null;
    emojis = [topic[0] ?? call].filter((e): e is string => !!e);
  } else {
    emojis = [face, ...topic].filter((e): e is string => !!e);
  }
  const max = kind !== 'joke' ? 1 : joke || mood === 'angry' ? 2 : 1;
  return { mood, emojis: [...new Set(emojis)].slice(0, max) };
}

export { hasEmoji, stripEmoji };

/**
 * The line as shown: a leading 👷/📻 before it, other emojis after it. A line
 * that already has an emoji is left alone, so nothing doubles up.
 */
export function decorate(text: string, emojis: string[]): string {
  if (!emojis.length || hasEmoji(text)) return text;
  const list = emojis.slice(0, 2);
  const lead = list.filter((e) => LEADING.has(e));
  const tail = list.filter((e) => !LEADING.has(e));
  let out = text.trim();
  if (lead.length) out = `${lead.join('')} ${out}`;
  if (tail.length) out = `${out} ${tail.join('')}`;
  return out;
}

/** moodOf + decorate in one call. */
export function moodLine(input: MoodInput): { text: string; mood: Mood; emojis: string[] } {
  const result = moodOf(input);
  return { ...result, text: decorate(input.text, result.emojis) };
}
