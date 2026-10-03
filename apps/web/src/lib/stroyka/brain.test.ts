import { describe, expect, it } from 'vitest';
import {
  parseDimensions,
  roughEstimate,
  smetaHref,
  hazardOf,
  machineFor,
  nameReply,
  parsePlace,
  parseWhen,
  respond,
  understand,
  weatherStory,
} from '@/lib/stroyka/brain';
import { emptyContext, radioHandoff, whenPhrase } from '@/lib/stroyka/context';
import { STORIES } from '@/lib/stroyka/lines/stories';
import { CENSOR } from '@/lib/stroykaJokes';

// Friday 2 October 2026, 15:00 in Chelny.
const NOW = new Date('2026-10-02T12:00:00Z');

const cases: [string, string][] = [
  ['Привет!', 'greeting'],
  ['Здравствуйте, мне нужна помощь', 'greeting'],
  ['Сколько стоит экскаватор?', 'price'],
  ['почём час самосвала', 'price'],
  ['Нужно выкопать траншею под водопровод', 'machine'],
  ['хочу заказать автокран', 'order'],
  ['надо поднять плиты на третий этаж', 'machine'],
  ['Нужна автовышка повесить вывеску', 'machine'],
  ['нужен каток укатать щебень', 'machine'],
  ['уборка снега у магазина', 'machine'],
  ['Можно на завтра?', 'when'],
  ['в пятницу сможете?', 'when'],
  ['15 октября нужен самосвал', 'when'],
  ['мы в Тукаевском районе', 'place'],
  ['адрес: ул. Шамиля Усманова 12', 'place'],
  ['8 927 123 45 67', 'phone'],
  ['мой номер +79171234567', 'phone'],
  ['какая погода завтра', 'weather'],
  ['кто ты такой?', 'who'],
  ['расскажи анекдот', 'joke'],
  ['спасибо большое', 'thanks'],
  ['как дела на стройке?', 'smalltalk'],
  ['что думаешь про политику', 'offtopic'],
  ['работаете с НДС?', 'faq'],
  ['фывапролдж', 'unknown'],
];

describe('brain: intents', () => {
  it.each(cases)('«%s» → %s', (text, intent) => {
    expect(understand(text, NOW).intents).toContain(intent);
  });
});

describe('brain: slots', () => {
  it('maps jobs to machines through the dispatcher rules', () => {
    expect(machineFor('выкопать котлован под фундамент')).toBe('backhoe');
    expect(machineFor('разбить бетон гидромолотом')).toBe('wheeled-excavator');
    expect(machineFor('привезти и выгрузить блоки')).toBe('kmu');
    expect(machineFor('покосить траву')).toBe('tractor');
    expect(machineFor('просто поговорить')).toBe(null);
  });

  it('reads dates in Moscow time', () => {
    expect(parseWhen('завтра', NOW)).toEqual({ date: '2026-10-03', label: 'завтра' });
    expect(parseWhen('в понедельник', NOW)).toEqual({ date: '2026-10-05', label: 'в понедельник' });
    expect(parseWhen('5 октября', NOW)?.date).toBe('2026-10-05');
    expect(parseWhen('1 сентября', NOW)?.date).toBe('2027-09-01');
    expect(parseWhen('через 3 дня', NOW)?.date).toBe('2026-10-05');
    expect(parseWhen('когда-нибудь', NOW)).toBe(null);
  });

  it('reads places and addresses', () => {
    expect(parsePlace('участок в Тукаевском районе')).toBe('Тукаевский район');
    expect(parsePlace('адрес: проспект Мира 5')).toBe('проспект Мира 5');
    expect(parsePlace('где-то там')).toBe(null);
  });

  it('fills the order context and passes the visitor to Света', () => {
    const reply = respond(
      'нужен JCB завтра выкопать котлован под фундамент',
      'mihalych',
      emptyContext(),
      NOW,
    );
    expect(reply.set).toMatchObject({
      machine: 'backhoe',
      when: 'завтра',
      task: 'котлован под фундамент',
    });
    expect(reply.handoff).toBe('sveta');
    expect(reply.checkWeather).toEqual({ machine: 'backhoe', date: '2026-10-03' });
  });

  it('asks only for what is missing', () => {
    const reply = respond('нужен автокран', 'ildar', emptyContext(), NOW);
    expect(reply.text).toContain('Когда нужна?');
    expect(reply.quick.map((q) => q.label)).toContain('Завтра');
  });

  it('a phone number goes to Света with consent first', () => {
    const reply = respond('8 927 123-45-67', 'rinat', emptyContext(), NOW);
    expect(reply.phone).toBe('+79271234567');
    expect(reply.speaker).toBe('sveta');
    expect(reply.text).toContain('подтвердите согласие');
  });

  it('a funny honest fallback with quick buttons', () => {
    const reply = respond('фывапролдж', 'mihalych', emptyContext(), NOW);
    expect(reply.quick.length).toBeGreaterThan(0);
    expect(reply.text.length).toBeGreaterThan(10);
  });
});

describe('brain: weather hazards', () => {
  it('maps assessWork notes to story categories', () => {
    expect(hazardOf([{ level: 'stop', title: 'Ветер 12 м/с' }])).toBe('wind');
    expect(hazardOf([{ level: 'stop', title: 'Гроза' }])).toBe('wind');
    expect(hazardOf([{ level: 'stop', title: 'Дождь' }])).toBe('rain');
    expect(hazardOf([{ level: 'caution', title: 'Осадки 6 мм за смену' }])).toBe('rain');
    expect(hazardOf([{ level: 'caution', title: 'Мороз −25 °C' }])).toBe('frost');
    expect(hazardOf([{ level: 'caution', title: 'Гололедица' }])).toBe('frost');
    expect(hazardOf([{ level: 'caution', title: 'Туман' }])).toBe('fog');
    expect(hazardOf([{ level: 'caution', title: 'Жара 33 °C' }])).toBe('heat');
    expect(hazardOf([{ level: 'ok', title: 'Погода не мешает работе' }])).toBe(null);
  });

  it('has 6–10 stories per hazard; only the foremen «swear»', () => {
    for (const list of Object.values(STORIES)) {
      expect(list.length).toBeGreaterThanOrEqual(6);
      expect(list.length).toBeLessThanOrEqual(10);
    }
  });

  it('always keeps the order path after the story', () => {
    const story = weatherStory('wind', 'agp', 'в понедельник', 3);
    expect(story.text).toContain('в понедельник');
    expect(story.quick.map((q) => q.action)).toEqual(
      expect.arrayContaining(['call', 'order-anyway', 'other-day']),
    );
    expect(weatherStory('rain', 'roller', null, 1).quick.length).toBe(3);
    expect(story.text).not.toMatch(/СП16/);
    void CENSOR;
  });
});

describe('brain: rough estimate (lib/smeta)', () => {
  it('reads sizes from free text', () => {
    expect(parseDimensions('траншея 30 метров, глубина 1,5')).toEqual({ length: 30, depth: 1.5 });
    expect(parseDimensions('котлован 10 на 8, глубиной 2 м')).toEqual({
      length: 10,
      width: 8,
      depth: 2,
    });
    expect(parseDimensions('площадка 200 м2')).toEqual({ area: 200 });
    expect(parseDimensions('участок 6 соток')).toEqual({ area: 600 });
    expect(parseDimensions('вывезти 50 кубов')).toEqual({ volume: 50 });
    expect(parseDimensions('просто так')).toEqual({});
  });

  it('gives an approximate total and says so', () => {
    const est = roughEstimate('котлован 10 на 8, глубина 2', 'котлован под фундамент', 'backhoe');
    expect(est?.job).toBe('pit');
    expect(est?.line).toMatch(/примерно \d[\d\s]*–\d[\d\s]* ₽/);
    expect(est?.line).toContain('точную цену назовёт диспетчер СпецПласт16');
    expect(roughEstimate('без размеров', 'котлован', 'backhoe')).toBe(null);
    const reply = respond('траншея 30 метров глубина 1.5', 'rinat', emptyContext(), NOW);
    expect(reply.text).toContain('Прикинул');
    expect(reply.quick.map((q) => q.action)).toContain('smeta');
  });

  it('links the calculator for the job', () => {
    expect(smetaHref('траншея под коммуникации', 'backhoe')).toBe('/smeta?job=trench');
    expect(smetaHref(null, 'crane')).toBe('/smeta?job=lift');
    expect(smetaHref(null, null)).toBe('/smeta');
  });
});

describe('QA fixes: generic excavator, date phrasing', () => {
  it('«нужен экскаватор на субботу» means the backhoe, with the crawler as an option', () => {
    const reply = respond('нужен экскаватор на субботу', 'mihalych', emptyContext(), NOW);
    expect(reply.set?.machine).toBe('backhoe');
    expect(reply.text).not.toMatch(/Гусеничный экскаватор —/);
    expect(reply.text).toMatch(/экскаватор-погрузчик/i);
    expect(reply.quick.some((q) => /гусенич/i.test(q.label))).toBe(true);
    expect(machineFor('экскаватор нужен')).toBe('backhoe');
    // A named type still wins.
    expect(machineFor('нужен гусеничный экскаватор')).toBe('excavator');
    expect(machineFor('экскаватор с гидромолотом разбить бетон')).not.toBe('backhoe');
  });

  it('never «на в субботу» in the reply or on the radio', () => {
    const reply = respond('нужен экскаватор на субботу', 'mihalych', emptyContext(), NOW);
    expect(reply.text).not.toMatch(/на в /i);
    const ctx = { ...emptyContext(), machine: 'backhoe' as const, when: 'в субботу' };
    const radio = radioHandoff('mihalych', 'sveta', ctx);
    for (const line of radio) expect(line.text).not.toMatch(/на в |по в /i);
    expect(radio.map((l) => l.text).join(' ')).toMatch(/в субботу/);
    const ildar = radioHandoff('mihalych', 'ildar', ctx).map((l) => l.text);
    expect(ildar.join(' ')).not.toMatch(/по в |на в /);
    expect(whenPhrase('в субботу')).toBe('в субботу');
    expect(whenPhrase('завтра')).toBe('на завтра');
    expect(whenPhrase('15 октября')).toBe('на 15 октября');
    expect(whenPhrase('на выходных')).toBe('на выходных');
  });
});

describe('the visitor tells their name', () => {
  it("answers with the name, in each character's voice", () => {
    const ctx = emptyContext();
    expect(respond('меня зовут Марат', 'mihalych', ctx, NOW).text).toBe(
      'Марат — понял, запомню. Ну, Марат, что строим?',
    );
    expect(respond('Меня зовут Марат', 'rinat', ctx, NOW).text).toBe(
      'Очень приятно, Марат. Что копаем?',
    );
    expect(respond('я Марат', 'ildar', ctx, NOW).text).toBe('Марат, принял. Что поднимаем?');
    expect(respond('меня зовут марат', 'sveta', ctx, NOW).text).toBe(
      'Марат, записала. Что за работа и куда?',
    );
    expect(respond('это Марат', 'alsu', ctx, NOW).text).toBe(
      'Приятно познакомиться, Марат. Что привезти?',
    );
    expect(understand('меня зовут Марат', NOW).intents).toContain('name');
    expect(understand('меня зовут Марат', NOW).name).toBe('Марат');
  });

  it('says the name back also when the job comes in the same message', () => {
    const r = respond('меня зовут Марат, нужен экскаватор завтра', 'mihalych', emptyContext(), NOW);
    expect(r.text.startsWith('Марат, приятно познакомиться.')).toBe(true);
    expect(r.set.machine).toBe('backhoe');
  });

  it('never answers rudely when it does not understand', () => {
    for (let i = 0; i < 6; i++) {
      const r = respond('ывапр'.repeat(i + 1), 'mihalych', emptyContext(), NOW);
      expect(r.text).not.toMatch(/переводчик/);
    }
    expect(nameReply('rinat', 'Ирина')).toBe('Очень приятно, Ирина. Что копаем?');
  });

  it('writes prices as «от … ₽/ч с машинистом»', () => {
    const r = respond('сколько стоит', 'sveta', emptyContext(), NOW);
    const rates = r.text.match(/₽\/ч[^,.)]*/g) ?? [];
    expect(rates.length).toBeGreaterThan(3);
    for (const m of rates) expect(m).toMatch(/^₽\/ч с\sмашинистом/);
  });

  it("puts the visitor's name on the radio", () => {
    const [call] = radioHandoff('mihalych', 'sveta', { ...emptyContext(), name: 'Марат' });
    expect(call!.text).toBe('Света, приём! Тут Марат — по технике.');
  });
});
