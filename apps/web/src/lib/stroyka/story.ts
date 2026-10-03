// /stroyka as a short personal film (owner, 2026-10-03: «наш сайт — не просто
// сайт, а кино с историей для каждого… мне должно казаться, что со мной
// говорит живой человек»). Pure text picking, no React: the chapter title
// cards, the lines where a character remembers the visitor's job, the
// returning visitor's last machine and the end credits.
//
// No numbers, prices or promises here: only mood and the people of the site.

import { MACHINE_SLANG, contextFacts, type OrderContext } from '@/lib/stroyka/context';
import { CREW } from '@/lib/stroyka/crew';
import { ZONES, type SpeakerId, type ZoneId } from '@/lib/stroyka';
import type { MachineType } from '@/lib/machinePhotos';
import { worldProgress, type WorldProgress } from '@/lib/stroyka/progress';

// ------------------------------------------------------------ chapters

/** What the page knows about the moment: Moscow hour, weekday and weather. */
export interface Moment {
  /** Hour in Moscow, 0…23. */
  hour: number;
  /** Day of the week in Moscow, 0 = Sunday … 6 = Saturday. */
  weekday: number;
  rain?: boolean;
  snow?: boolean;
  fog?: boolean;
  wind?: boolean;
  cold?: boolean;
  heat?: boolean;
}

export type TimeSlot = 'morning' | 'day' | 'evening' | 'night';
type WeatherSlot = 'snow' | 'rain' | 'fog' | 'wind' | 'cold' | 'heat';
type Slot = TimeSlot | WeatherSlot | 'friday';

/** Night 22–6, morning 6–11, day 11–18, evening 18–22 (the site's own clock). */
export function timeSlot(hour: number): TimeSlot {
  if (hour >= 22 || hour < 6) return 'night';
  if (hour < 11) return 'morning';
  if (hour < 18) return 'day';
  return 'evening';
}

/** One line per zone for every time of day, plus the weather that changes the scene. */
export const CHAPTER_LINES: Record<
  ZoneId,
  Record<TimeSlot, string> & Partial<Record<Slot, string>>
> = {
  gate: {
    morning:
      'Николай Петрович открывает ворота. Первым, как всегда, въезжает JCB СпецПласт16 — Ринат за рулём.',
    day: 'Михалыч у ворот: телефон у уха, каска на затылке. День в самом разгаре.',
    evening:
      'Смена к концу. Михалыч считает машины СпецПласт16 у ворот — все вернулись, можно выдохнуть.',
    night: 'Ворота заперты, прожектор гудит. Николай Петрович наливает чай и слушает тишину.',
    rain: 'Дождь стучит по каскам. Михалыч уже велел постелить щиты у въезда.',
    snow: 'За ночь намело. Трактор СпецПласт16 уже чистит въезд, Михалыч ворчит, но улыбается.',
    fog: 'Туман такой, что кран видно только по огоньку на стреле.',
    wind: 'Ветер треплет флаг на воротах. Михалыч поглядывает на него чаще, чем на часы.',
    cold: 'Мороз щиплет щёки. В будке у ворот — горячий чай для всех, кто заходит.',
    heat: 'Жара. У ворот бак с водой, и Михалыч сам следит, чтобы он не пустел.',
  },
  kotlovan: {
    morning: 'Ринат с шести утра в кабине. Термос уже пустой.',
    day: 'Ковш за ковшом. Ринат копает так ровно, будто чертит котлован по линейке.',
    evening: 'Последний ковш за смену. Ринат глушит мотор и смотрит, что получилось.',
    night: 'Котлован спит. У края стоит JCB СпецПласт16, ещё тёплый после смены.',
    rain: 'Глина налипает на колёса. Ринат не спешит: в дождь торопиться — себе дороже.',
    snow: 'Снег засыпал бровку котлована. Ринат прогревает гидравлику и ждёт, пока оттает кабина.',
    cold: 'Мёрзлый грунт звенит под ковшом. Ринат прогрел машину ещё затемно.',
    heat: 'Кабина раскалилась, как печка. Ринат открыл обе двери и копает дальше.',
  },
  planirovka: {
    morning: 'Михалыч идёт вдоль колышков с нивелиром и шевелит губами — считает отметки.',
    day: 'Бульдозер СпецПласт16 ровняет площадку. «Ровная площадка — половина дома», — говорит Михалыч.',
    evening: 'Длинные тени ложатся на ровную землю. Михалыч доволен: сегодня ни одной кочки.',
    night: 'Площадка ровная, как стол. Завтра на ней начнётся чей-то дом.',
    rain: 'Под дождём грунт тяжелеет. Бульдозерист ждёт, Михалыч смотрит то в небо, то в прогноз.',
    snow: 'Снег лёг ровно — бульдозеру почти нечего исправлять. Почти.',
  },
  doroga: {
    morning:
      'Первый самосвал СпецПласт16 выходит на технологическую дорогу. Нурлан машет ему рукой.',
    day: 'Самосвал за самосвалом. Каток идёт следом и укатывает всё, что они растрясли.',
    evening: 'Пыль оседает. Последний рейс — и водители поедут домой, к ужину.',
    night: 'Дорога пустая. Утром по ней снова пойдут машины.',
    rain: 'Колея наполняется водой. Сегодня дорогу проверяют сапогами, а не на глаз.',
    snow: 'Свежий снег на дороге, и только две колеи — от первого самосвала.',
  },
  sklad: {
    morning: 'Поддоны пересчитаны, накладные подписаны. Алсу уже прикидывает, кому что везти.',
    day: 'Манипулятор СпецПласт16 поднимает поддон, а Айдар провожает его взглядом, как родного.',
    evening: 'Склад закрывается. Алсу ставит последнюю галочку в накладной.',
    night: 'На складе темно и тихо. Утром здесь снова начнётся суета.',
    rain: 'Цемент — под навес, блоки — под плёнку. Дождь склад врасплох не застанет.',
    snow: 'Поддоны в снежных шапках. Айдар бережно обметает их веником.',
  },
  korpus: {
    morning: 'Корпус встречает утро новым этажом. Ещё недавно здесь было только небо.',
    day: 'Стук, гул, голоса с этажей, у фасада — автовышка СпецПласт16. Корпус растёт, и это слышно.',
    evening: 'Окна корпуса ловят закат. Однажды в них зажжётся свет.',
    night: 'Корпус стоит в лесах и прожекторах. Даже ночью видно, как он вырос.',
    rain: 'Дождь стекает по опалубке. Наверху работают в дождевиках и не жалуются.',
    snow: 'Снег на перекрытиях. Михалыч говорит, что так корпус выглядит наряднее.',
    wind: 'Наверху ветер сильнее. Все пристёгнуты — Михалыч проверил сам.',
  },
  montazh: {
    morning: 'Ильдар поднимается в кабину крана. Сверху уже видно Каму.',
    day: '«Вира помалу!» Армен ведёт груз, а Ильдар отвечает плавно, как оркестр дирижёру.',
    evening:
      'Последний подъём за день. Ильдар опускает крюк и смотрит, как солнце садится за Каму.',
    night: 'Стрела крана замерла. Огонёк на её конце светит, как маяк.',
    rain: 'Капли на стекле кабины. Ильдар работает без спешки — в дождь всё скользкое.',
    snow: 'Снег на стреле крана. Ильдар греет руки о кружку и ждёт команды.',
    wind: 'Ильдар смотрит на анемометр чаще, чем на часы. С ветром кран СпецПласт16 не спорит.',
    fog: 'Туман укрыл стрелу. Сегодня Ильдар слушает рацию особенно внимательно.',
  },
  office: {
    morning: 'В прорабской пахнет кофе. Света отвечает на три телефона и всех называет по имени.',
    day: 'Света из СпецПласт16 уже звонит насчёт бетона. На доске графика — ни одного свободного места.',
    evening: 'День к концу, а телефон всё звонит. Света улыбается и снова берёт трубку.',
    night: 'В прорабской горит одна лампа. На столе — завтрашний график, уже расписанный.',
    rain: 'За окном дождь. Света обзванивает всех заранее, чтобы ни одна машина СпецПласт16 не ехала зря.',
    snow: 'Трактор на уборку снега — первым в графике. Света записала его ещё с вечера.',
  },
  smeta: {
    morning: 'Алсу раскладывает накладные стопками. Калькулятор уже тёплый.',
    day: 'Цемент, песок, блоки — всё от СпецПласт16. Алсу считает так, чтобы не было ни лишнего, ни нехватки.',
    evening: 'Смета сошлась до копейки. Алсу позволяет себе вторую чашку чая.',
    night: 'Тетради закрыты, калькулятор спит. Завтра Алсу снова сведёт всё до копейки.',
    rain: 'Дождь — повод пересчитать плёнку и навесы. Алсу пересчитывает с удовольствием.',
    snow: 'Снег — значит, песок на дорожки. Алсу уже вписала его в смету.',
    friday: 'Пятница. В сметном отделе пахнет эчпочмаком — Алсу опять напекла на всю бригаду.',
  },
};

/** Weather that changes the scene, strongest first. */
const WEATHER_ORDER: WeatherSlot[] = ['snow', 'rain', 'fog', 'wind', 'cold', 'heat'];

/** The mood line under the chapter title: Friday, then the weather, then the time of day. */
export function chapterSubtitle(zone: ZoneId, m: Moment): string {
  const lines = CHAPTER_LINES[zone];
  const slot = timeSlot(m.hour);
  if (m.weekday === 5 && slot !== 'night' && lines.friday) return lines.friday;
  for (const w of WEATHER_ORDER) if (m[w] && lines[w]) return lines[w]!;
  return lines[slot];
}

export interface Chapter {
  number: number;
  /** «Глава 2 · Котлован». */
  title: string;
  name: string;
  subtitle: string;
}

export function chapter(zone: ZoneId, m: Moment): Chapter {
  const i = ZONES.findIndex((z) => z.id === zone);
  const name = ZONES[i]!.name;
  return {
    number: i + 1,
    title: `Глава ${i + 1} · ${name}`,
    name,
    subtitle: chapterSubtitle(zone, m),
  };
}

/** Moscow hour and weekday of a moment (the page clock is UTC-based). */
export function mskMoment(date: Date): Pick<Moment, 'hour' | 'weekday'> {
  const msk = new Date(date.getTime() + 3 * 3_600_000);
  return { hour: msk.getUTCHours(), weekday: msk.getUTCDay() };
}

// ------------------------------------------------------------ remembering the visitor

const CALL: Record<SpeakerId, string> = {
  mihalych: 'Михалыч',
  rinat: 'Ринат',
  sveta: 'Света',
  ildar: 'Ильдар',
  alsu: 'Алсу',
};

/** Who works the machine on this site, when it is one of the named characters. */
export function machineHand(machine: MachineType | undefined): 'rinat' | 'ildar' | null {
  if (machine === 'backhoe' || machine === 'excavator' || machine === 'wheeled-excavator')
    return 'rinat';
  if (machine === 'crane' || machine === 'kmu') return 'ildar';
  return null;
}

const feminine = (slang: string) => /а$/.test(slang);

/** «у тебя котлован под фундамент» / «вам нужна автовышка» — nominative only, no case endings to break. */
function about(ctx: OrderContext, ty: boolean): string | null {
  if (ctx.task) return `${ty ? 'у тебя' : 'у вас'} ${ctx.task}`;
  if (ctx.machine) {
    const slang = MACHINE_SLANG[ctx.machine];
    return `${ty ? 'тебе' : 'вам'} ${feminine(slang) ? 'нужна' : 'нужен'} ${slang}`;
  }
  return null;
}

/**
 * A character in another zone remembers what the visitor told earlier, or
 * null: nothing told yet, or this character already heard it (then the zone
 * line repeats the facts anyway, see contextIntro).
 */
export function callbackLine(speaker: SpeakerId, ctx: OrderContext): string | null {
  if (ctx.heardBy.includes(speaker)) return null;
  const ty = speaker === 'mihalych' || speaker === 'ildar';
  const job = about(ctx, ty);
  if (!job) return null;
  const hand = machineHand(ctx.machine);
  const theirs =
    hand === 'rinat'
      ? 'Ринат уже прикидывает, с какого угла заходить.'
      : hand === 'ildar'
        ? 'Ильдар уже думает, как подать груз.'
        : null;
  switch (speaker) {
    case 'mihalych':
      return `Слышал-слышал: ${job}. ${theirs ?? 'Я уже прикидываю, где машине встать, чтобы никому не мешать.'}`;
    case 'rinat':
      return `Это ведь ${job}? ${
        hand === 'rinat'
          ? 'Я уже прикидываю, с какого угла заходить.'
          : (theirs ?? 'Хорошая задача, понятная.')
      }`;
    case 'ildar':
      return `Слышал, ${job}. ${
        hand === 'ildar'
          ? 'Я уже прикидываю, откуда удобнее подать груз.'
          : (theirs ?? 'Сверху всё видно — я твою задачу уже себе представил.')
      }`;
    case 'sveta':
      return `А, ${job}! Я запомнила. ${theirs ?? 'Когда дойдёте до заявки, половина у меня уже записана.'}`;
    case 'alsu':
      return `${capitalFirst(job)}, да? Если понадобятся материалы — спросите, посчитаю.`;
  }
}

function capitalFirst(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

// ------------------------------------------------------------ end credits

const MAIN_CAST: SpeakerId[] = ['mihalych', 'rinat', 'ildar', 'sveta', 'alsu'];

/** «вы, Михалыч и Ринат». */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`;
}

export interface Credits {
  /** «вы», then the characters in the order the visitor met them, then the rest. */
  starring: string[];
  /** The crew by name. */
  featuring: string[];
  /** «По мотивам вашей заявки: …» (no address), or null. */
  story: string | null;
}

export function credits(ctx: OrderContext, met: SpeakerId[]): Credits {
  const order = [...new Set([...met, ...MAIN_CAST])].filter((s) => MAIN_CAST.includes(s));
  const facts = contextFacts({ ...ctx, address: undefined });
  return {
    starring: ['вы', ...order.map((s) => CALL[s])],
    featuring: Object.values(CREW).map((m) => m.name),
    story: facts ? `По мотивам вашей заявки: ${facts}.` : null,
  };
}

// ------------------------------------------------------------ returning visitors

/** Михалыч and Ильдар say «ты», the others «вы». */
const ty = (speaker: SpeakerId) => speaker === 'mihalych' || speaker === 'ildar';

/**
 * Accusative for «про …» / «на …»: the head word and the word after «и»/«или»
 * change («траншея под коммуникации» → «траншею под коммуникации»), the
 * dependent words stay («планировка участка» → «планировку участка»).
 */
export function accusative(phrase: string): string {
  const words = phrase.split(' ');
  return words
    .map((w, i) => {
      const head = i === 0 || words[i - 1] === 'и' || words[i - 1] === 'или';
      if (!head) return w;
      if (/[ьеи]я$/.test(w)) return `${w.slice(0, -1)}ю`;
      if (/[^аяоеиуыэюё]а$/.test(w)) return `${w.slice(0, -1)}у`;
      return w;
    })
    .join(' ');
}

const GREETINGS_NAMED: Record<SpeakerId, string[]> = {
  mihalych: [
    '{name}, с возвращением! Рад тебя видеть, честное слово.',
    'О, {name}! С возвращением. Каска твоя на месте висит.',
    '{name}, с возвращением! СпецПласт16 своих не забывает.',
  ],
  rinat: [
    '{name}, с возвращением! Я вас ещё из кабины узнал.',
    '{name}, здравствуйте! Хорошо, что снова к нам.',
  ],
  ildar: [
    '{name}, с возвращением! Сверху тебя сразу заметил.',
    '{name}! Рад видеть. Кама сегодня тоже на месте.',
  ],
  sveta: [
    '{name}, с возвращением! Видите — я помню, как вас зовут.',
    '{name}, здравствуйте! Рада, что снова к нам заглянули.',
  ],
  alsu: [
    '{name}, с возвращением! Чай как раз горячий.',
    '{name}, здравствуйте! Хорошо, что зашли.',
  ],
};

const GREETINGS: Record<SpeakerId, string[]> = {
  mihalych: [
    'Опять к нам? Свой человек на стройке уже.',
    'С возвращением! Каску помнишь, где брать.',
    'О, знакомое лицо! С возвращением на объект СпецПласт16.',
  ],
  rinat: ['Опять к нам? Свой человек на стройке уже.', 'С возвращением! Рад, что снова заглянули.'],
  ildar: [
    'Опять к нам? Свой человек на стройке уже. Сверху махну.',
    'С возвращением! Отсюда видно, кто к нам возвращается.',
  ],
  sveta: ['С возвращением! Вас тут уже узнают.', 'Опять к нам? Свой человек на стройке уже.'],
  alsu: [
    'С возвращением! Свой человек на стройке уже — проходите.',
    'Опять к нам? Своих мы всегда рады видеть.',
  ],
};

/** A greeting by the zone's character, never the same one twice in a row. */
export function greeting(
  speaker: SpeakerId,
  name: string | undefined,
  avoid: string | undefined,
  random: () => number = Math.random,
): { id: string; text: string } {
  const pool = (name ? GREETINGS_NAMED : GREETINGS)[speaker].map((text, i) => ({
    id: `${speaker}-${name ? 'n' : 'a'}${i}`,
    text: name ? text.replace('{name}', name) : text,
  }));
  const fresh = pool.filter((g) => g.id !== avoid);
  const from = fresh.length ? fresh : pool;
  return from[Math.floor(random() * from.length) % from.length]!;
}

/** A zone line without its own «Здорово!» when a greeting already came first. */
export function withoutHello(text: string): string {
  const rest = text.replace(/^(Здорово|Привет|Здравствуйте|Добрый день)[!,.]\s*/, '');
  return rest === text ? text : capitalFirst(rest);
}

/** «Пока вас не было…» without its own «С возвращением», which the greeting already says. */
export function awayTail(away: string | null): string {
  if (!away) return '';
  const rest = away.replace(/^С возвращением(!\s*|\s*—\s*)/, '').trim();
  return rest ? capitalFirst(rest) : '';
}

/** What the visitor asked about last time (consented memory only). */
export function lastTimeLine(
  speaker: SpeakerId,
  mem: { task?: string; machine?: MachineType },
): string | null {
  const slang = mem.machine && MACHINE_SLANG[mem.machine];
  const what = mem.task ? accusative(mem.task) : slang ? accusative(slang) : null;
  if (!what) return null;
  const extra = mem.task && slang ? ` — ${slang}` : '';
  const head = ty(speaker)
    ? `Помню, в прошлый раз речь была про ${what}${extra}.`
    : `В прошлый раз вы спрашивали про ${what}${extra}.`;
  const tail =
    speaker === 'sveta'
      ? 'Понадобится снова — скажите, сразу поставлю в график.'
      : ty(speaker)
        ? 'Понадобится снова — скажи, сразу передам Свете.'
        : 'Понадобится снова — скажите, сразу передам Свете.';
  return `${head} ${tail}`;
}

/** «Ваша заявка на экскаватор у Светы» (consented memory only). */
export function orderStatusLine(
  speaker: SpeakerId,
  mem: { sent?: boolean; sentMachine?: MachineType },
): string | null {
  if (!mem.sent) return null;
  const on = mem.sentMachine ? ` на ${accusative(MACHINE_SLANG[mem.sentMachine])}` : '';
  if (speaker === 'sveta') return `Ваша заявка${on} у меня, я в курсе.`;
  return `${ty(speaker) ? 'Твоя' : 'Ваша'} заявка${on} у Светы, она в курсе.`;
}

// ------------------------------------------------------------ hooks to come back

const DAY = 86_400_000;

/**
 * Days until the object moves to its next stage, read only through the
 * progress API (so slower timelines and new objects need no change here),
 * or null. The real progress can be ahead of the time-only formula (site
 * activity adds to it): the search first finds the moment when the formula
 * reaches the shown stage, then counts the days to the next one.
 */
export function daysToNextStage(
  p: Pick<WorldProgress, 'projectIndex' | 'stage' | 'stagePercent'>,
  now: number,
  horizon = 400,
): number | null {
  const same = (q: WorldProgress) => q.projectIndex === p.projectIndex && q.stage === p.stage;
  let from = -1;
  for (let d = 0; d <= horizon; d++) {
    const q = worldProgress(now + d * DAY, null);
    if (same(q) && q.stagePercent >= p.stagePercent) {
      from = d;
      break;
    }
    if (q.projectIndex > p.projectIndex) return null;
  }
  if (from < 0) return null;
  for (let d = 1; d <= horizon; d++) {
    if (!same(worldProgress(now + (from + d) * DAY, null))) return d;
  }
  return null;
}

/** «Уже завтра», «Через пару дней»… or null when too far to name. */
export function soonPhrase(days: number | null): string | null {
  if (days === null) return null;
  if (days <= 1) return 'Уже завтра';
  if (days <= 3) return 'Через пару дней';
  if (days <= 6) return 'На днях';
  if (days <= 13) return 'Через неделю-другую';
  if (days <= 40) return 'Через несколько недель';
  return null;
}

const HOOKS: Record<SpeakerId, string[]> = {
  mihalych: [
    '{when} начнём {stage} — заходи, будет на что посмотреть.',
    '{when} у нас {stage}. Приходи посмотреть — такое не каждый день.',
  ],
  rinat: [
    '{when} по плану {stage}. Заходите — покажу, с чего начинаем.',
    '{when} начинаем {stage}. Техника СпецПласт16 будет на месте первой, как обычно.',
  ],
  ildar: [
    '{when} — {stage}. Сверху будет красиво, заходи посмотреть.',
    '{when} у нас {stage}. Из кабины такое видно лучше всего — заглядывай.',
  ],
  sveta: [
    '{when} начинаем {stage}. Я уже обзваниваю всех, кто понадобится, — заходите посмотреть.',
    '{when} — {stage}. Технику СпецПласт16 на этот этап я уже держу в графике.',
  ],
  alsu: [
    '{when} у нас {stage}. Материалы уже считаю — заходите, расскажу, что к чему.',
    '{when} — {stage}. Для меня это новая смета, для вас — повод заглянуть.',
  ],
};

/** What happens next on the object and roughly when, in the character's words. */
export function hookLine(
  speaker: SpeakerId,
  p: Pick<WorldProgress, 'nextMilestone'>,
  days: number | null,
  random: () => number = Math.random,
): string {
  const stage =
    p.nextMilestone.stage === 0 ? 'новый объект' : `этап «${p.nextMilestone.stageName}»`;
  const when = soonPhrase(days);
  if (!when) {
    return `Дальше по плану — ${stage}. ${ty(speaker) ? 'Заходи' : 'Заходите'}, будет на что посмотреть.`;
  }
  const pool = HOOKS[speaker];
  return pool[Math.floor(random() * pool.length) % pool.length]!.replace('{when}', when).replace(
    '{stage}',
    stage,
  );
}

// ------------------------------------------------------------ the memory offer

/** Who offers: Света in her office, Михалыч everywhere else. */
export const offerSpeaker = (zoneSpeaker: SpeakerId): 'mihalych' | 'sveta' =>
  zoneSpeaker === 'sveta' ? 'sveta' : 'mihalych';

export const OFFER_TEXT: Record<'mihalych' | 'sveta', string> = {
  mihalych:
    'Слушайте, давайте я вас запомню? Буду узнавать при встрече, помнить, что вы строите и о чём договорились, — придёте в следующий раз, а мы уже в курсе. Для этого нужно ваше согласие на обработку данных.',
  sveta:
    'Хотите, я вас запомню? Буду узнавать, помнить, что вы строите и о чём договорились, — в следующий раз не придётся рассказывать заново. Для этого нужно ваше согласие на обработку данных.',
};

export function offerYesText(speaker: 'mihalych' | 'sveta', name?: string): string {
  const you = name ? `, ${name}` : '';
  return speaker === 'sveta'
    ? `Записала${you}! Теперь я вас узнаю. Придёте — продолжим с того же места.`
    : `Договорились${you}! Теперь я вас запомню. Придёте — продолжим с того же места.`;
}

export function offerNoText(speaker: 'mihalych' | 'sveta'): string {
  return speaker === 'sveta'
    ? 'Конечно, как скажете. Работаем как работали.'
    : 'Без обид, понимаю. Работаем как работали.';
}

export function forgetText(name?: string): string {
  return `Всё, забыл${name ? `, ${name}` : ''}. Имя, задачу, заявку — всё стёр. А если зайдёте снова — всё равно обрадуюсь.`;
}
