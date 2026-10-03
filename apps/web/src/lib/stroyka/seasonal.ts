// Holidays on the /stroyka site, by the real date in Moscow time. Pure: the
// engine decorates the world from the flags, the page has the characters say
// the lines. Tasteful and friendly, no politics.

import { SITE } from '@/lib/site';
import type { BanterSpeaker } from '@/lib/stroykaJokes';

export type SeasonId = 'newyear' | 'builder' | 'sabantuy' | 'march8' | 'feb23';

export interface SeasonLine {
  speaker: BanterSpeaker;
  text: string;
}

export interface SeasonEvent {
  id: SeasonId;
  title: string;
  /** Text of a banner on the fence by the gate. */
  banner?: string;
  /** A garland on the crane. */
  garland: boolean;
  /** A fir tree by the site cabin. */
  tree: boolean;
  /** Snow on the ground and in the air, whatever the forecast. */
  snow: boolean;
  /** Evening fireworks over the site. */
  fireworks: boolean;
  /** Bunting over the gate. */
  flags: boolean;
  /** Flowers by Света's and Алсу's posts. */
  flowers: boolean;
  /** Said once each: the first goes to the speaker's greeting. */
  lines: SeasonLine[];
}

const BASE = {
  garland: false,
  tree: false,
  snow: false,
  fireworks: false,
  flags: false,
  flowers: false,
};

/** Day of month of the second Sunday of August in `year`. */
export function builderDay(year: number): number {
  const first = new Date(Date.UTC(year, 7, 1)).getUTCDay(); // 0 = Sunday
  return 1 + ((7 - first) % 7) + 7;
}

/** The holiday on this date (Moscow time), or null on an ordinary day. */
export function seasonalEvent(date: Date): SeasonEvent | null {
  const msk = new Date(date.getTime() + 3 * 3600_000);
  const m = msk.getUTCMonth() + 1;
  const d = msk.getUTCDate();
  const y = msk.getUTCFullYear();

  if ((m === 12 && d >= 15) || (m === 1 && d <= 14)) {
    const before = m === 12;
    return {
      ...BASE,
      id: 'newyear',
      title: before ? 'Скоро Новый год' : 'Новогодние праздники',
      garland: true,
      tree: true,
      snow: true,
      lines: [
        {
          speaker: 'mihalych',
          text: before ? 'С наступающим! 🎄' : 'С Новым годом! 🎄 Старый Новый год тоже отметим.',
        },
        { speaker: 'worker', text: 'Ёлку у прорабской сами ставили — ровная, по уровню! 🎄' },
        { speaker: 'ildar', text: 'Гирлянду на кран вешал я. Сверху видно — красота! ✨' },
        {
          speaker: 'sveta',
          text: 'В праздники тоже работаем — записывайтесь заранее, всех развезу 🎄',
        },
      ],
    };
  }

  if (m === 8) {
    const day = builderDay(y);
    if (d >= day - 3 && d <= day)
      return {
        ...BASE,
        id: 'builder',
        title: 'День строителя',
        banner: `С Днём строителя! — ${SITE.name}`,
        fireworks: true,
        flags: true,
        lines: [
          { speaker: 'mihalych', text: 'С Днём строителя, мужики! Сегодня без ворчания 🏗️' },
          { speaker: 'rinat', text: 'С праздником! Ковш помыл, как на парад 🚜' },
          { speaker: 'sveta', text: 'С Днём строителя! Всем по чак-чаку, график подождёт 🎉' },
          {
            speaker: 'worker',
            text: 'Вечером салют над объектом — Ильдар обещал не мешать стрелой 🎆',
          },
        ],
      };
  }

  if (m === 6 && d >= 20) {
    return {
      ...BASE,
      id: 'sabantuy',
      title: 'Сабантуй',
      flags: true,
      lines: [
        { speaker: 'rinat', text: 'На Сабантуй собрался — в этом году на столб точно залезу! 🎉' },
        { speaker: 'worker', text: 'Михалыч в забег с яйцом в ложке записался 😂' },
        { speaker: 'alsu', text: 'Чак-чак на Сабантуй уже заказала, на всю бригаду 🍯' },
      ],
    };
  }

  if (m === 3 && d === 8) {
    return {
      ...BASE,
      id: 'march8',
      title: '8 Марта',
      flowers: true,
      lines: [
        {
          speaker: 'mihalych',
          text: 'Света, Алсу — с 8 Марта! Без вас тут ни одна машина не приедет 💐',
        },
        { speaker: 'ildar', text: 'Цветы девушкам поднимал краном — аккуратно, как самовар 💐' },
        { speaker: 'worker', text: 'С праздником, девушки! Сегодня кофе варим мы 💐' },
        { speaker: 'rinat', text: 'Ковш помыл, цветы купил. Алсу, Света — с праздником! 💐' },
      ],
    };
  }

  if (m === 2 && d === 23) {
    return {
      ...BASE,
      id: 'feb23',
      title: '23 Февраля',
      lines: [
        { speaker: 'sveta', text: 'Мужчины, с 23 Февраля! Чай с чак-чаком в прорабской ☕' },
        { speaker: 'alsu', text: 'С праздником! Всей бригаде — новые перчатки, по размеру 🧤' },
      ],
    };
  }

  return null;
}
