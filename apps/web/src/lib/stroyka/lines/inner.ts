// «Внутренняя жизнь» of the main characters (owner, 2026-10-03: «мне должно
// казаться, что со мной говорит живой человек с эмоциями и своими
// переживаниями»). A small pool per character, warm and never heavy, that
// comes up rarely in the idle line under the business dialogue (Stroyka.tsx)
// and never while the visitor is busy with an order.
//
// Not in LINES on purpose: lib/stroyka/voice.test.ts requires a recording for
// every line of the recorded speakers (Михалыч, Ринат, Ильдар), and these are
// not recorded yet. Lines with `voiced: false` are shown as text only (no
// sp:dialog event, so no robotic browser voice next to the recorded ones).
// scripts/stroyka-voice-lines.ts already lists them for the recorder; once
// the clips exist, flip `voiced` to true.
//
// To record (voiced: false): every line of mihalych, rinat and ildar below.
// Света and Алсу have no recorded voice at all; their lines speak through the
// browser like the rest of theirs.

import type { SpeakerId } from '@/lib/stroyka';

export interface InnerLine {
  id: string;
  speaker: SpeakerId;
  text: string;
  /** Whether a recording exists (or the speaker uses the browser voice). */
  voiced: boolean;
  /** Said only after this line (a small story told in steps). */
  after?: string;
  /** When the line fits; default any time. */
  when?: 'day' | 'morning' | 'friday' | 'not-friday';
}

const RECORDED: SpeakerId[] = ['mihalych', 'rinat', 'ildar'];

type Raw = [id: string, text: string, opts?: Pick<InnerLine, 'after' | 'when'>];

const RAW: Record<SpeakerId, Raw[]> = {
  // Михалыч ждёт бетон: волнуется, потом выдыхает.
  mihalych: [
    [
      'concrete-1',
      'Бетон на сегодня заказан, а я всё равно с утра на часы смотрю. Сколько лет на стройке — а переживаю, как в первый раз.',
      { when: 'day' },
    ],
    [
      'concrete-2',
      'Света уже звонила: миксер едет. Я ей верю, честно. Но на дорогу всё равно поглядываю.',
      { after: 'concrete-1', when: 'day' },
    ],
    [
      'concrete-3',
      'Приехал бетон! Минута в минуту. Вот теперь можно и чаю попить — первый раз за утро.',
      { after: 'concrete-2', when: 'day' },
    ],
    [
      'concrete-4',
      'Залили. Стою и смотрю, как блестит. Красиво, а? Вот за такие минуты я эту работу и люблю.',
      { after: 'concrete-3', when: 'day' },
    ],
    ['sleep', 'Внук говорит, я даже во сне командую: «Левее, левее… стоп!» Может быть. Не помню.'],
    [
      'houses',
      'Я иногда вечером объезжаю дома, которые мы построили. Смотрю, как в окнах горит свет. Только никому не говори.',
    ],
    [
      'helmet',
      'Внук спрашивает, почему у деда каска вся в царапинах. Говорю: это ордена. Он верит.',
    ],
  ],
  // Дочка Рината пошла в первый класс.
  rinat: [
    [
      'school-1',
      'Дочка в этом году пошла в первый класс. Показала мне пропись — пишет ровнее, чем я траншею копаю. Горжусь.',
    ],
    [
      'school-2',
      'Утром отвёл дочку в школу. Она машет мне из окна, а я — в кабину, на свой JCB. Весь день улыбаюсь.',
      { when: 'morning' },
    ],
    [
      'school-3',
      'Дочка нарисовала мой экскаватор: жёлтый, с бантиком на ковше. Повесил в кабине — пусть все видят.',
    ],
    [
      'school-4',
      'Дочка спрашивает: «Пап, а котлован под школу ты тоже копал?» Пока нет. Но очень хочу.',
      { after: 'school-1' },
    ],
  ],
  // Ильдар любит вид на Каму из кабины башенного крана.
  ildar: [
    [
      'kama-1',
      'Отсюда, сверху, Каму видно. Утром она серебряная, вечером — золотая. Каждый день разная, и каждый раз дух захватывает.',
    ],
    [
      'kama-2',
      'Говорят, крановщик сидит один. Неправда: со мной Кама, небо и весь город. Хорошая компания.',
    ],
    [
      'kama-3',
      'Когда кран стоит и ветер стихает, я минуту просто смотрю на реку. Потом снова работа. А эта минута — моя.',
    ],
    [
      'kama-4',
      'Отец всю жизнь водил баржи по Каме. Звоню ему из кабины: «Пап, твою реку вижу!» Он смеётся.',
    ],
  ],
  // Света на трёх телефонах и всех помнит по имени.
  sveta: [
    [
      'phones-1',
      'У меня три телефона: рабочий, второй рабочий и тот, по которому звонит мама. Мама, кстати, звонит чаще всех.',
    ],
    [
      'phones-2',
      'Я всех водителей знаю по именам. И их жён, и как зовут их собак. Человеку приятно, когда его помнят.',
    ],
    [
      'phones-3',
      'Бывает, звонят все три сразу. Беру по очереди и каждому говорю: «Минутку». Ещё никто не обиделся.',
    ],
    [
      'phones-4',
      'Ринат сегодня опять с дочкиным рисунком. Говорю: повесь в прорабской. А он: «Нет, его место в кабине».',
    ],
  ],
  // Алсу печёт эчпочмак для бригады по пятницам.
  alsu: [
    [
      'echpochmak-1',
      'Сегодня пятница, значит — эчпочмак. Пекла с вечера, по бабушкиному рецепту. Заходите, пока Ринат не добрался.',
      { when: 'friday' },
    ],
    [
      'echpochmak-2',
      'Михалыч уже третий раз заходит «за накладной». Я-то знаю, за какой он накладной.',
      { after: 'echpochmak-1', when: 'friday' },
    ],
    [
      'echpochmak-3',
      'По пятницам пеку эчпочмак на всю бригаду. Тесто тонкое, начинки много — по-бабушкиному.',
      { when: 'not-friday' },
    ],
    [
      'echpochmak-4',
      'Мужики с понедельника спрашивают: «Алсу, а в пятницу будет?» Будет, куда я денусь. Мне и самой приятно.',
      { when: 'not-friday' },
    ],
    ['echpochmak-5', 'Смета — как хороший пирог: всё должно сойтись по краям, иначе развалится.'],
  ],
};

export const INNER: Record<SpeakerId, InnerLine[]> = Object.fromEntries(
  (Object.keys(RAW) as SpeakerId[]).map((speaker) => [
    speaker,
    RAW[speaker].map(([id, text, opts]) => ({
      id: `${speaker}-inner-${id}`,
      speaker,
      text,
      voiced: !RECORDED.includes(speaker),
      ...(opts?.after ? { after: `${speaker}-inner-${opts.after}` } : {}),
      ...(opts?.when ? { when: opts.when } : {}),
    })),
  ]),
) as Record<SpeakerId, InnerLine[]>;

/** Every inner line, for the recorder script. */
export const INNER_LINES: InnerLine[] = Object.values(INNER).flat();

function fits(line: InnerLine, hour: number, weekday: number): boolean {
  const working = hour >= 6 && hour < 22;
  switch (line.when) {
    case 'day':
      return hour >= 7 && hour < 20;
    case 'morning':
      return hour >= 6 && hour < 11;
    case 'friday':
      return weekday === 5 && working;
    case 'not-friday':
      return weekday !== 5;
    default:
      return true;
  }
}

/**
 * The next inner line for `speaker`, or null when the pool is used up.
 * Never repeats a line from `said`; a story step waits for the step before it,
 * and the earliest open step of a story goes first.
 */
export function pickInner(
  speaker: SpeakerId,
  said: ReadonlySet<string>,
  moment: { hour: number; weekday: number },
  random: () => number = Math.random,
): InnerLine | null {
  const open = INNER[speaker].filter(
    (l) =>
      !said.has(l.id) && (!l.after || said.has(l.after)) && fits(l, moment.hour, moment.weekday),
  );
  if (!open.length) return null;
  return open[Math.floor(random() * open.length) % open.length]!;
}

/** How often an idle moment becomes an inner line instead of banter. */
export const INNER_SHARE = 0.3;
/** At least this long between two inner lines, so they stay rare. */
export const INNER_GAP_MS = 45_000;

/** Whether this idle moment may carry an inner line. */
export function innerTurn(
  lastAt: number | null,
  now: number,
  random: () => number = Math.random,
): boolean {
  if (lastAt !== null && now - lastAt < INNER_GAP_MS) return false;
  return random() < INNER_SHARE;
}
