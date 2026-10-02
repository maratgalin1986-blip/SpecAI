// The people of the construction site: who says what, in which voice, and
// how the comic «#@%&!» swearing becomes a TV-style beep. Pure helpers, so
// they can be tested without a browser; soundEngine.ts does the speaking.

export type Speaker = 'mihalych' | 'rinat' | 'sveta' | 'ildar' | 'worker';
export type LineKind = 'business' | 'joke' | 'radio';

export type Line = { speaker: Speaker; text: string; kind?: LineKind };

/** How each character sounds when only pitch and rate can tell them apart. */
export const SPEAKER_STYLE: Record<
  Speaker,
  { pitch: [number, number]; rate: [number, number]; female?: boolean }
> = {
  mihalych: { pitch: [0.68, 0.72], rate: [0.86, 0.92] }, // the foreman: low, unhurried
  rinat: { pitch: [0.95, 1.05], rate: [1.15, 1.25] }, // operator: quick
  sveta: { pitch: [1.2, 1.3], rate: [1.0, 1.08], female: true }, // dispatcher
  ildar: { pitch: [0.78, 0.82], rate: [0.82, 0.88] }, // crane operator: low and calm
  worker: { pitch: [0.8, 1.1], rate: [0.95, 1.15] },
};

/**
 * Background chatter of the main site, far back in the mix: commands, a few
 * clean jokes and, from the foremen only, «censored» grumbling (beeped).
 */
export const SITE_LINES: Line[] = [
  { speaker: 'mihalych', text: 'Вира помалу!' },
  { speaker: 'mihalych', text: 'Майна! Майна, говорю!' },
  { speaker: 'ildar', text: 'Стоп, стоп! Держу.' },
  { speaker: 'mihalych', text: 'Сань, подавай самосвал!' },
  { speaker: 'rinat', text: 'Ковш левее? Понял, левее.' },
  { speaker: 'mihalych', text: 'Перекур пять минут.' },
  { speaker: 'worker', text: 'Аккуратно, кабель!' },
  { speaker: 'ildar', text: 'Плиту на второй этаж, потихоньку.' },
  { speaker: 'sveta', text: 'Бетон будет через двадцать минут.' },
  { speaker: 'mihalych', text: 'Каток сюда, тут ещё раз пройди.' },
  { speaker: 'worker', text: 'Ещё полметра… ещё… стоп!' },
  { speaker: 'mihalych', text: 'Мужики, стропы проверьте.' },
  { speaker: 'sveta', text: 'Михалыч, манипулятор выехал, будет к обеду.' },
  // Jokes: clean, no politics.
  { speaker: 'rinat', text: 'Михалыч, каска где? — На голове, Ринат, на голове.', kind: 'joke' },
  { speaker: 'worker', text: 'Кто последний кофе брал — тот и стропит!', kind: 'joke' },
  { speaker: 'ildar', text: 'Сверху всё видно. Особенно, кто не работает.', kind: 'joke' },
  { speaker: 'sveta', text: 'В наряде всё сходится, до копейки. Чудо!', kind: 'joke' },
  { speaker: 'rinat', text: 'Каток не трактор, но тоже старается.', kind: 'joke' },
  // The foreman's «censored» grumbling.
  { speaker: 'mihalych', text: 'Кто ковш поставил на кабель, #@%&!', kind: 'joke' },
  { speaker: 'mihalych', text: 'Опять песок не туда, #@%&$! Переделываем.', kind: 'joke' },
  { speaker: 'ildar', text: 'Ветер, #@%! Ждём пять минут.', kind: 'joke' },
];

export type SpeechPart = { beep: true } | { beep: false; text: string };

// A run of #@%&$*! with at least one of #@%&$*: a lone «!» stays punctuation.
const CENSORED = /[#@%&$*!]*[#@%&$*][#@%&$*!]*/g;

/** Splits a line at «#@%&!» runs: each run becomes a beep, never spoken. */
export function splitCensored(text: string): SpeechPart[] {
  const parts: SpeechPart[] = [];
  let last = 0;
  for (const match of text.matchAll(CENSORED)) {
    const before = text.slice(last, match.index).trim();
    if (/[\p{L}\p{N}]/u.test(before)) parts.push({ beep: false, text: before });
    parts.push({ beep: true });
    last = (match.index ?? 0) + match[0].length;
  }
  const rest = text.slice(last).trim();
  if (/[\p{L}\p{N}]/u.test(rest)) parts.push({ beep: false, text: rest });
  return parts;
}

type VoiceLike = { name: string; lang: string };

const FEMALE =
  /female|жен|milena|irina|anna|elena|katya|alena|svetlana|daria|ekaterina|tatyana|google/i;

/**
 * Picks a distinct Russian voice per character where the browser has
 * several: Sveta takes a female voice, the men share the others in turn.
 */
export function voiceFor<V extends VoiceLike>(
  speaker: Speaker,
  voices: V[],
  random = Math.random,
): V | null {
  const ru = voices.filter((v) => v.lang.toLowerCase().startsWith('ru'));
  if (!ru.length) return null;
  const female = ru.filter((v) => FEMALE.test(v.name));
  const male = ru.filter((v) => !FEMALE.test(v.name));
  if (speaker === 'sveta') return female[0] ?? ru[ru.length - 1]!;
  const pool = male.length ? male : ru;
  const order: Record<Exclude<Speaker, 'sveta'>, number> = {
    mihalych: 0,
    rinat: 1,
    ildar: 2,
    worker: Math.floor(random() * pool.length),
  };
  return pool[order[speaker] % pool.length]!;
}

/** Pitch and rate for a character; a female voice for Sveta needs no lift. */
export function styleFor(
  speaker: Speaker,
  femaleVoice: boolean,
  random = Math.random,
): { pitch: number; rate: number } {
  const style = SPEAKER_STYLE[speaker] ?? SPEAKER_STYLE.worker;
  const pick = ([a, b]: [number, number]) => a + (b - a) * random();
  const pitch = pick(style.pitch);
  return {
    pitch: style.female && femaleVoice ? Math.min(pitch, 1.05) : pitch,
    rate: pick(style.rate),
  };
}

export function isFemaleVoice(voice: VoiceLike | null): boolean {
  return !!voice && FEMALE.test(voice.name);
}

export function asSpeaker(value: unknown): Speaker {
  return typeof value === 'string' && value in SPEAKER_STYLE ? (value as Speaker) : 'worker';
}
