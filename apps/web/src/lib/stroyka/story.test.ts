import { describe, expect, it } from 'vitest';
import { ZONES } from '@/lib/stroyka';
import { emptyContext, type OrderContext } from './context';
import {
  CHAPTER_LINES,
  callbackLine,
  chapter,
  chapterSubtitle,
  credits,
  forgetText,
  joinNames,
  OFFER_TEXT,
  offerSpeaker,
  offerYesText,
  machineHand,
  mskMoment,
  timeSlot,
  accusative,
  awayTail,
  daysToNextStage,
  greeting,
  hookLine,
  lastTimeLine,
  orderStatusLine,
  soonPhrase,
  withoutHello,
} from './story';
import { worldProgress, WORLD_START } from './progress';

const ctx = (patch: Partial<OrderContext>): OrderContext => ({ ...emptyContext(), ...patch });
const tuesdayNoon = { hour: 12, weekday: 2 };

describe('chapter cards', () => {
  it('numbers the zones in tour order', () => {
    expect(chapter('gate', tuesdayNoon).title).toBe('Глава 1 · Проходная');
    expect(chapter('kotlovan', tuesdayNoon).title).toBe('Глава 2 · Котлован');
    expect(chapter('smeta', tuesdayNoon).number).toBe(ZONES.length);
  });

  it('has a line for every zone and time of day', () => {
    for (const z of ZONES) {
      for (const slot of ['morning', 'day', 'evening', 'night'] as const) {
        expect(CHAPTER_LINES[z.id][slot], `${z.id} ${slot}`).toBeTruthy();
      }
    }
  });

  it('splits the day into the site clock', () => {
    expect(timeSlot(5)).toBe('night');
    expect(timeSlot(6)).toBe('morning');
    expect(timeSlot(11)).toBe('day');
    expect(timeSlot(18)).toBe('evening');
    expect(timeSlot(22)).toBe('night');
  });

  it('follows the time of day', () => {
    expect(chapterSubtitle('kotlovan', { hour: 7, weekday: 2 })).toBe(
      'Ринат с шести утра в кабине. Термос уже пустой.',
    );
    expect(chapterSubtitle('kotlovan', { hour: 23, weekday: 2 })).toBe(
      CHAPTER_LINES.kotlovan.night,
    );
  });

  it('lets the weather change the scene, snow before rain', () => {
    expect(chapterSubtitle('gate', { ...tuesdayNoon, rain: true })).toBe(CHAPTER_LINES.gate.rain);
    expect(chapterSubtitle('gate', { ...tuesdayNoon, rain: true, snow: true })).toBe(
      CHAPTER_LINES.gate.snow,
    );
    // No wind line for the road: the time of day stays.
    expect(chapterSubtitle('doroga', { ...tuesdayNoon, wind: true })).toBe(
      CHAPTER_LINES.doroga.day,
    );
  });

  it('smells of эчпочмак on a Friday, but not at night', () => {
    expect(chapterSubtitle('smeta', { hour: 12, weekday: 5 })).toMatch(/эчпочмак/);
    expect(chapterSubtitle('smeta', { hour: 23, weekday: 5 })).toBe(CHAPTER_LINES.smeta.night);
    expect(chapterSubtitle('smeta', { hour: 12, weekday: 4 })).toBe(CHAPTER_LINES.smeta.day);
  });

  it('reads Moscow time from the page clock', () => {
    // 2026-10-02 22:30 UTC is Saturday 01:30 in Moscow.
    expect(mskMoment(new Date('2026-10-02T22:30:00Z'))).toEqual({ hour: 1, weekday: 6 });
  });

  it('has no numbers and the brand written right', () => {
    const all = Object.values(CHAPTER_LINES).flatMap((l) => Object.values(l));
    for (const line of all) {
      expect(line.replace(/СпецПласт16/g, '')).not.toMatch(/\d/);
      expect(line).not.toMatch(/СП16|СпецПласт 16/);
    }
  });

  it('places the brand in some lines, not in every one', () => {
    const all = Object.values(CHAPTER_LINES).flatMap((l) => Object.values(l));
    const branded = all.filter((l) => l.includes('СпецПласт16')).length;
    expect(branded).toBeGreaterThan(0);
    expect(branded).toBeLessThanOrEqual(3);
    const days = Object.values(CHAPTER_LINES).map((l) => l.day);
    expect(days.filter((l) => l.includes('СпецПласт16')).length).toBeLessThanOrEqual(3);
  });
});

describe('characters remember the visitor', () => {
  it('says nothing until the visitor told something', () => {
    expect(callbackLine('rinat', emptyContext())).toBeNull();
  });

  it('stays quiet for someone who already heard it', () => {
    expect(
      callbackLine('rinat', ctx({ task: 'котлован под фундамент', heardBy: ['rinat'] })),
    ).toBeNull();
  });

  it('brings the job back in another zone', () => {
    expect(callbackLine('rinat', ctx({ task: 'котлован под фундамент', machine: 'backhoe' }))).toBe(
      'Это ведь у вас котлован под фундамент? Я уже прикидываю, с какого угла заходить.',
    );
    expect(
      callbackLine('mihalych', ctx({ task: 'котлован под фундамент', machine: 'backhoe' })),
    ).toBe(
      'Слышал-слышал: у тебя котлован под фундамент. Ринат уже прикидывает, с какого угла заходить.',
    );
  });

  it('keeps the grammar with a feminine machine and no task', () => {
    expect(callbackLine('sveta', ctx({ machine: 'agp' }))).toBe(
      'А, вам нужна автовышка! Я запомнила. Когда дойдёте до заявки, половина у меня уже записана.',
    );
    expect(callbackLine('ildar', ctx({ machine: 'crane' }))).toBe(
      'Слышал, тебе нужен автокран. Я уже прикидываю, откуда удобнее подать груз.',
    );
    expect(callbackLine('alsu', ctx({ task: 'планировка участка' }))).toBe(
      'У вас планировка участка, да? Если понадобятся материалы — спросите, посчитаю.',
    );
  });

  it('knows who works which machine', () => {
    expect(machineHand('excavator')).toBe('rinat');
    expect(machineHand('kmu')).toBe('ildar');
    expect(machineHand('roller')).toBeNull();
  });
});

describe('end credits', () => {
  it('puts the visitor first, then whom they met, then the rest', () => {
    const c = credits(ctx({ task: 'котлован под фундамент', address: 'ул. Мира, 1' }), [
      'rinat',
      'sveta',
    ]);
    expect(c.starring).toEqual(['Вы', 'Ринат', 'Света', 'Михалыч', 'Ильдар', 'Алсу']);
    expect(joinNames(c.starring)).toBe('Вы, Ринат, Света, Михалыч, Ильдар и Алсу');
    expect(credits(emptyContext(), [], 'Марат').starring[0]).toBe('Марат');
    // The address stays out of the titles.
    expect(c.story).toBe('По мотивам вашей заявки: котлован под фундамент.');
    expect(c.featuring).toContain('Николай Петрович');
  });

  it('has no story line for an empty order', () => {
    expect(credits(emptyContext(), []).story).toBeNull();
    expect(joinNames(['вы'])).toBe('вы');
  });
});

describe('returning visitors', () => {
  it('puts tasks and machines into the accusative without breaking them', () => {
    expect(accusative('траншея под коммуникации')).toBe('траншею под коммуникации');
    expect(accusative('планировка участка')).toBe('планировку участка');
    expect(accusative('отсыпка и укатка дороги')).toBe('отсыпку и укатку дороги');
    expect(accusative('уборка снега или покос')).toBe('уборку снега или покос');
    expect(accusative('котлован под фундамент')).toBe('котлован под фундамент');
    expect(accusative('большой котлован')).toBe('большой котлован');
    expect(accusative('автовышка')).toBe('автовышку');
    expect(accusative('JCB')).toBe('JCB');
  });

  it('greets by name and never twice the same in a row', () => {
    const first = greeting('mihalych', 'Марат', undefined, () => 0);
    expect(first.text).toMatch(/^Марат, с возвращением!/);
    for (let i = 0; i < 10; i++) {
      expect(greeting('mihalych', 'Марат', first.id, () => i / 10).id).not.toBe(first.id);
    }
    expect(greeting('rinat', undefined, undefined, () => 0).text).toBe(
      'Вы снова к нам — рад, честно.',
    );
    // Nobody shares a greeting with another character.
    const all = (['mihalych', 'rinat', 'ildar', 'sveta', 'alsu'] as const).flatMap((s) =>
      [0, 0.99].map((r) => greeting(s, undefined, undefined, () => r).text),
    );
    expect(new Set(all).size).toBe(all.length);
  });

  it('keeps what changed but drops the second «С возвращением»', () => {
    expect(awayTail('С возвращением! Работа идёт по плану.')).toBe('');
    expect(awayTail('Вас не было 5 дней. С возвращением!')).toBe('Вас не было 5 дней.');
    expect(awayTail('Вас не было 5 дней.', 'mihalych')).toBe('Тебя не было 5 дней.');
    expect(awayTail('С возвращением — ЖК «Кама» уже сдали.')).toBe('ЖК «Кама» уже сдали.');
    expect(awayTail('Вас не было 5 дней. За это время: залили фундамент.')).toBe(
      'Вас не было 5 дней. За это время: залили фундамент.',
    );
    expect(awayTail(null)).toBe('');
  });

  it('remembers what was asked last time', () => {
    expect(lastTimeLine('rinat', { task: 'траншея под коммуникации', machine: 'backhoe' })).toBe(
      'В прошлый раз вы спрашивали про траншею под коммуникации — JCB. Понадобится снова — скажите, сразу передам Свете.',
    );
    expect(lastTimeLine('mihalych', { machine: 'agp' })).toBe(
      'Помню, в прошлый раз речь была про автовышку. Понадобится снова — скажи, сразу передам Свете.',
    );
    expect(lastTimeLine('sveta', {})).toBeNull();
  });

  it('knows where the order is', () => {
    expect(orderStatusLine('rinat', { sent: true, sentMachine: 'excavator' })).toBe(
      'Ваша заявка на гусеничный экскаватор у Светы, она в курсе.',
    );
    expect(orderStatusLine('sveta', { sent: true })).toBe('Ваша заявка у меня, я в курсе.');
    expect(orderStatusLine('mihalych', {})).toBeNull();
  });
});

describe('hooks to come back', () => {
  it('finds the next stage through the progress API', () => {
    const now = WORLD_START + 2 * 86_400_000;
    const p = worldProgress(now, null);
    const days = daysToNextStage(p, now);
    expect(days).not.toBeNull();
    expect(worldProgress(now + days! * 86_400_000, null).stage).not.toBe(p.stage);
    expect(worldProgress(now + (days! - 1) * 86_400_000, null).stage).toBe(p.stage);
  });

  it('starts from the shown progress when activity put it ahead', () => {
    const now = WORLD_START + 86_400_000;
    const ahead = worldProgress(now + 3 * 86_400_000, null);
    const days = daysToNextStage(ahead, now);
    const plain = daysToNextStage(ahead, now + 3 * 86_400_000);
    expect(days).toBe(plain);
  });

  it('says roughly when', () => {
    expect(soonPhrase(1)).toBe('Уже завтра');
    expect(soonPhrase(3)).toBe('Через пару дней');
    expect(soonPhrase(10)).toBe('Через неделю-другую');
    expect(soonPhrase(90)).toBeNull();
    expect(soonPhrase(null)).toBeNull();
  });

  it('names the next stage from the progress, with or without a date', () => {
    const p = {
      nextMilestone: {
        stage: 2,
        stageName: 'каркас',
        remainingPercent: 40,
        startsAt: 0,
        daysLeft: 2,
      },
    };
    expect(hookLine('mihalych', p, 2, () => 0)).toBe(
      'Через пару дней начнём этап «каркас» — заходи, будет на что посмотреть.',
    );
    expect(hookLine('rinat', p, null)).toBe(
      'Дальше по плану — этап «каркас». Заходите, будет на что посмотреть.',
    );
    const handover = {
      nextMilestone: {
        stage: 0,
        stageName: 'котлован',
        remainingPercent: 5,
        startsAt: 0,
        daysLeft: 0,
      },
    };
    expect(hookLine('alsu', handover, null)).toMatch(/новый объект/);
  });
});

describe('greeting before a zone line', () => {
  it('drops the zone line’s own hello after a greeting', () => {
    expect(withoutHello('Здорово! Ты по делу? Говори, что строим.')).toBe(
      'Ты по делу? Говори, что строим.',
    );
    expect(withoutHello('Котлован под фундамент?')).toBe('Котлован под фундамент?');
  });
});

describe('honest memory lines', () => {
  it('«Забыть меня» says only this device forgets, the order stays with the dispatcher', () => {
    const t = forgetText('Марат');
    expect(t).toContain('на этом устройстве, Марат');
    expect(t).toContain('Саму заявку диспетчер доведёт до конца');
    expect(t).not.toMatch(/всё стёр|заявку — всё/);
    // A way to reach the operator: the dispatcher's phone and the consent page's e-mail.
    expect(t).toContain('позвоните диспетчеру');
    expect(t).toContain('напишите на почту из раздела «Согласие»');
  });

  it('every offer names what is kept: the name, the job and the order', () => {
    for (const text of Object.values(OFFER_TEXT)) {
      expect(text).toMatch(
        /Запомню имя, что (вы строите|ты строишь) и что (заказывали|было в заявке)/,
      );
      expect(text).toContain('Нужно');
    }
    expect(OFFER_TEXT.sveta).toBe(
      'Хотите, я вас запомню? Запомню имя, что вы строите и что заказывали. Хранится только в этом браузере, на сервер не уходит. Нужно ваше согласие.',
    );
  });

  it('after «Забыть меня» the greeting does not claim to recognise the visitor', () => {
    for (const speaker of ['mihalych', 'rinat', 'sveta', 'ildar', 'alsu'] as const)
      for (let i = 0; i < 4; i++) {
        const g = greeting(speaker, undefined, undefined, () => i / 4, true);
        expect(g.text).not.toMatch(/узна|возвращ|снова|помн/i);
      }
  });

  it("the zone's own character offers, saying where it is kept, «ты» or «вы» by character", () => {
    expect(offerSpeaker('rinat')).toBe('rinat');
    for (const [speaker, text] of Object.entries(OFFER_TEXT)) {
      expect(text).toContain('Хранится только в этом браузере');
      const ty = speaker === 'mihalych' || speaker === 'ildar';
      if (ty) expect(text).not.toMatch(/(^|\s)(вас|вы|ваше)(\s|[,.?!])/i);
      else expect(text).not.toMatch(/(^|\s)(тебя|ты|твоё)(\s|[,.?!])/i);
    }
    expect(offerYesText('mihalych', 'Марат')).toBe(
      'Договорились, Марат! Теперь узнаю тебя. Придёшь — продолжим с того же места.',
    );
  });

  it('a sent order is «у Светы» for three days, then «как всё прошло?»', () => {
    const sentAt = Date.parse('2026-10-01T10:00:00Z');
    const mem = { sent: true, sentMachine: 'backhoe' as const, sentAt };
    expect(orderStatusLine('rinat', mem, sentAt + 86_400_000)).toBe(
      'Ваша заявка на JCB у Светы, она в курсе.',
    );
    expect(orderStatusLine('mihalych', mem, sentAt + 4 * 86_400_000)).toBe(
      'В прошлый раз от тебя была заявка на JCB — как всё прошло?',
    );
    // After an order: no «понадобится снова» tail.
    expect(lastTimeLine('rinat', { task: 'котлован под фундамент', sent: true })).toBe(
      'В прошлый раз вы спрашивали про котлован под фундамент.',
    );
  });
});
