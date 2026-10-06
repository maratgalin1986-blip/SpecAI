// Voice lines for /stroyka, about 200 per character, loaded lazily with the
// 3D page. Hand-written lines plus opener × remark templates; a shuffle-bag
// per character so nothing repeats until the pool is used up.
//
// Tags: joke, talk, business, ad, greet, return, idle, night, morning, day,
// lunch, evening, rain, snow, fog, wind, cold, heat, clear, event:<name>.

import type { BanterSpeaker } from '@/lib/stroykaJokes';
import { ShuffleBag } from '@/lib/stroyka/shuffleBag';
import { ALSU, ALSU_TEMPLATES } from './alsu';
import { ILDAR, ILDAR_TEMPLATES } from './ildar';
import { MIHALYCH, MIHALYCH_TEMPLATES } from './mihalych';
import { RINAT, RINAT_TEMPLATES } from './rinat';
import { SVETA, SVETA_TEMPLATES } from './sveta';
import type { RadioPair, RawLine, Template } from './types';
import { WORKER, WORKER_TEMPLATES } from './worker';

export interface Line {
  id: string;
  speaker: BanterSpeaker;
  text: string;
  tags: string[];
}

function build(speaker: BanterSpeaker, hand: RawLine[], templates: Template): Line[] {
  const lines: Line[] = hand.map(([text, tags], i) => ({
    id: `${speaker}-h${i}`,
    speaker,
    text,
    tags: tags.split(' '),
  }));
  templates.openers.forEach((opener, o) =>
    templates.remarks.forEach(([remark, tags], r) =>
      lines.push({
        id: `${speaker}-t${o}-${r}`,
        speaker,
        text: opener + remark,
        tags: tags.split(' '),
      }),
    ),
  );
  return lines;
}

export const LINES: Record<BanterSpeaker, Line[]> = {
  mihalych: build('mihalych', MIHALYCH, MIHALYCH_TEMPLATES),
  rinat: build('rinat', RINAT, RINAT_TEMPLATES),
  sveta: build('sveta', SVETA, SVETA_TEMPLATES),
  ildar: build('ildar', ILDAR, ILDAR_TEMPLATES),
  alsu: build('alsu', ALSU, ALSU_TEMPLATES),
  worker: build('worker', WORKER, WORKER_TEMPLATES),
};

/** Radio chatter between characters (shown in the «Рация» log). */
export const RADIO_PAIRS: RadioPair[] = [
  {
    a: 'alsu',
    aText: 'Света, приём! Песок на завтра — два рейса, щебень — один. Поставишь самосвалы?',
    b: 'sveta',
    bText: 'Приняла, Алсу. Самосвалы на восемь и на десять, накладные тебе.',
    tags: 'any',
  },
  {
    a: 'mihalych',
    aText: 'Алсу, приём! Блоков хватит на третий этаж?',
    b: 'alsu',
    bText: 'Михалыч, хватит, ещё и поддон в запасе. Смету скинула в вагончик.',
    tags: 'any',
  },
  {
    a: 'alsu',
    aText: 'Михалыч, приём! Цемент приехал, куда ставить?',
    b: 'mihalych',
    bText: 'Принял, Алсу. Под навес, на поддоны. И плёнкой накрыть.',
    tags: 'rain',
  },
  {
    a: 'rinat',
    aText: 'Ильдар, приём! Плиты подать сможешь после обеда?',
    b: 'ildar',
    bText: 'Принял, Ринат. Если ветер не поднимется — подам.',
    tags: 'calm',
  },
  {
    a: 'rinat',
    aText: 'Ильдар, приём! Плиты после обеда подашь?',
    b: 'ildar',
    bText: 'Ринат, ветер сильный, кран не поднимаем. Запишу на завтра.',
    tags: 'wind',
  },
  {
    a: 'mihalych',
    aText: 'Света, приём! Бетон на завтра на семь утра заказала?',
    b: 'sveta',
    bText: 'Приняла, Михалыч. Миксер на семь, второй — к девяти.',
    tags: 'any',
  },
  {
    a: 'mihalych',
    aText: 'Света, у соседей экскаватор сломался, просят помочь.',
    b: 'sveta',
    bText: 'Пусть звонят СпецПласт16 — у нас подача в день заявки. Шучу, уже записала их.',
    tags: 'ad',
  },
  {
    a: 'sveta',
    aText: 'Ринат, приём! Ты на Сидоровке до скольких?',
    b: 'rinat',
    bText: 'Света, до четырёх. Потом свободен, ставь на вечер.',
    tags: 'any',
  },
  {
    a: 'ildar',
    aText: 'Михалыч, приём! Стропальщика пришли на монтаж.',
    b: 'mihalych',
    bText: 'Принял. Ищу его… Петрович! Ильдар зовёт!',
    tags: 'any',
  },
  {
    a: 'mihalych',
    aText: 'Ринат, самосвал в грязи сел у въезда, дёрнешь?',
    b: 'rinat',
    bText: 'Принял, Михалыч. Иду, ковшом подтолкну.',
    tags: 'rain',
  },
  {
    a: 'sveta',
    aText: 'Ильдар, ветер какой у вас?',
    b: 'ildar',
    bText: 'Света, по анемометру нормально. Работаем.',
    tags: 'calm',
  },
  {
    a: 'mihalych',
    aText: 'Света, трактор на уборку снега на утро поставь.',
    b: 'sveta',
    bText: 'Приняла, на шесть утра. Подача в день заявки — как всегда.',
    tags: 'snow',
  },
  {
    a: 'sveta',
    aText: 'Михалыч, миксер на подходе, встречайте.',
    b: 'mihalych',
    bText: 'Принял, Света. Мужики, бетон едет — освобождаем въезд!',
    tags: 'any',
  },
  {
    a: 'rinat',
    aText: 'Михалыч, обед у нас по расписанию?',
    b: 'mihalych',
    bText: 'По расписанию, Ринат. Обед — дело святое.',
    tags: 'lunch',
  },
  {
    a: 'mihalych',
    aText: 'Сторож, приём! Как обстановка?',
    b: 'worker',
    bText: 'Тихо, Михалыч, всё закрыто, прожекторы горят.',
    tags: 'night',
  },
];

/** Conditions the visitor is in, for picking tags. */
export interface LineConditions {
  hour: number;
  rain: boolean;
  snow: boolean;
  fog: boolean;
  wind: boolean;
  cold: boolean;
  heat: boolean;
  liftStop: boolean;
}

export function conditionTags(c: LineConditions): string[] {
  const tags: string[] = [];
  if (c.hour >= 22 || c.hour < 6) tags.push('night');
  else if (c.hour < 11) tags.push('morning');
  else if (c.hour >= 12 && c.hour < 13) tags.push('lunch');
  else if (c.hour >= 18) tags.push('evening');
  else tags.push('day');
  if (c.rain) tags.push('rain');
  if (c.snow) tags.push('snow');
  if (c.fog) tags.push('fog');
  if (c.wind) tags.push('wind');
  if (c.cold) tags.push('cold');
  if (c.heat) tags.push('heat');
  if (!c.rain && !c.snow && !c.fog) tags.push('clear');
  return tags;
}

/** At most about 1 in 6 ambient lines mentions the company. */
export const AD_SHARE = 1 / 7;

export class LinePicker {
  private bag: ShuffleBag;
  private recent: string[] = [];
  constructor(
    used: string[] = [],
    private random: () => number = Math.random,
  ) {
    this.bag = new ShuffleBag(used, random);
  }

  get used() {
    return this.bag.used;
  }

  /**
   * A line for `speaker` with one of `want` tags (or general banter). Ads come
   * only with probability AD_SHARE and never twice in a row.
   */
  pick(speaker: BanterSpeaker, want: string[] = [], allowAd = true): Line | null {
    const pool = LINES[speaker];
    const lastWasAd = this.recent[this.recent.length - 1] === 'ad';
    const ad = allowAd && !lastWasAd && this.random() < AD_SHARE;
    let candidates: Line[];
    if (ad) candidates = pool.filter((l) => l.tags.includes('ad'));
    else {
      const wanted = want.length ? pool.filter((l) => l.tags.some((t) => want.includes(t))) : [];
      candidates = wanted.length
        ? wanted
        : pool.filter((l) => l.tags.some((t) => t === 'joke' || t === 'talk' || t === 'business'));
      candidates = candidates.filter((l) => !l.tags.includes('ad'));
    }
    const id = this.bag.next(candidates.map((l) => l.id));
    const line = pool.find((l) => l.id === id) ?? null;
    if (line) this.recent = [...this.recent, line.tags.includes('ad') ? 'ad' : 'line'].slice(-6);
    return line;
  }

  /** A radio exchange that fits the conditions. */
  radio(c: LineConditions): RadioPair {
    const tags = conditionTags(c);
    const fits = RADIO_PAIRS.filter((p) => {
      if (p.tags === 'any') return true;
      if (p.tags === 'calm') return !c.wind && !c.liftStop;
      if (p.tags === 'wind') return c.wind || c.liftStop;
      if (p.tags === 'ad') return this.random() < AD_SHARE * 2;
      return tags.includes(p.tags);
    });
    const ids = fits.map((p) => `radio-${RADIO_PAIRS.indexOf(p)}`);
    const id = this.bag.next(ids);
    return RADIO_PAIRS[Number(id?.slice(6) ?? 0)] ?? RADIO_PAIRS[0]!;
  }
}
