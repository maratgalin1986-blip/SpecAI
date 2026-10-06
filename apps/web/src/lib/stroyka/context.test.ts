import { describe, expect, it } from 'vitest';
import {
  applyReply,
  contextFacts,
  contextIntro,
  emptyContext,
  orderProgress,
  orderSummary,
  radioHandoff,
  renderLine,
  wizardHref,
} from '@/lib/stroyka/context';
import { LINES, LinePicker, lineTexts, RADIO_PAIRS, sayLine } from '@/lib/stroyka/lines';
import { ShuffleBag } from '@/lib/stroyka/shuffleBag';
import { CENSOR } from '@/lib/stroykaJokes';

const job = () =>
  applyReply(
    applyReply(emptyContext(), 'Котлован под фундамент', {
      task: 'котлован под фундамент',
      machine: 'backhoe',
    }),
    'Завтра',
    { when: 'завтра' },
  );

describe('shuffle-bag', () => {
  it('does not repeat until the pool is exhausted, then starts over', () => {
    const bag = new ShuffleBag();
    const ids = ['a', 'b', 'c', 'd'];
    const first = new Set(ids.map(() => bag.next(ids)));
    expect(first.size).toBe(4);
    expect(ids).toContain(bag.next(ids));
    expect(bag.next([])).toBe(null);
  });

  it('remembers used ids across visits', () => {
    const bag = new ShuffleBag(['a', 'b', 'c']);
    expect(bag.next(['a', 'b', 'c', 'd'])).toBe('d');
    expect(bag.used).toEqual(expect.arrayContaining(['a', 'b', 'c', 'd']));
  });
});

describe('voice lines', () => {
  it('has about 200 ways to speak per character, unique ids', () => {
    for (const pool of Object.values(LINES)) {
      expect(pool.flatMap(lineTexts).length).toBeGreaterThanOrEqual(150);
      expect(new Set(pool.map((l) => l.id)).size).toBe(pool.length);
    }
  });

  // A template remark is one entry of the shuffle-bag, whatever the opener:
  // the same remark does not come back until the rest of the pool was said.
  it('counts a template remark once, with a random opener', () => {
    const remarks = LINES.mihalych.filter((l) => l.openers);
    expect(remarks.length).toBeGreaterThan(5);
    remarks.forEach((l, r) => expect(l.id).toBe(`mihalych-t-${r}`));
    const first = remarks[0]!;
    const a = sayLine(first, () => 0);
    const b = sayLine(first, () => 0.99);
    expect(a.id).toBe(first.id);
    expect(b.id).toBe(first.id);
    expect(a.text).toBe(first.openers![0] + first.text);
    expect(b.text).toBe(first.openers![first.openers!.length - 1] + first.text);
    expect(lineTexts(first)).toHaveLength(first.openers!.length);
    // Through the picker: a remark (any opener) does not come back until the
    // whole pool of remarks was said.
    const picker = new LinePicker();
    const said: string[] = [];
    const pool = LINES.mihalych.filter(
      (l) => !l.tags.includes('ad') && l.tags.some((t) => ['joke', 'talk', 'business'].includes(t)),
    );
    for (let i = 0; i < pool.length; i++) {
      const line = picker.pick('mihalych', [], false);
      if (line?.id.includes('-t-')) said.push(line.id);
      if (line?.id.includes('-t-'))
        expect(first.openers!.some((o) => line.text.startsWith(o))).toBe(true);
    }
    expect(new Set(said).size).toBe(said.length);
    // No opener clashes with what follows (no «Между нами:» before advice).
    expect(LINES.sveta.find((l) => l.openers)?.openers).not.toContain('Между нами: ');
    expect(LINES.alsu.find((l) => l.openers)?.openers).not.toContain('Чтобы не переплатить: ');
    expect(LINES.worker.find((l) => l.openers)?.openers).not.toContain('Эх, ');
  });

  it('keeps Света and Ринат clean, comic swearing only as symbols', () => {
    for (const line of [...LINES.sveta, ...LINES.rinat, ...LINES.alsu])
      expect(line.text).not.toMatch(CENSOR);
    for (const pool of Object.values(LINES))
      for (const line of pool) expect(line.text).not.toMatch(/СП16|SP16|сп16/i);
  });

  it('rotates company mentions rarely', () => {
    let ads = 0;
    const picker = new LinePicker();
    for (let i = 0; i < 600; i++) if (picker.pick('mihalych')?.tags.includes('ad')) ads++;
    expect(ads / 600).toBeLessThanOrEqual(1 / 6);
    expect(ads).toBeGreaterThan(0);
    // The crew advertise nothing, and still always have a line.
    const crew = new LinePicker([], () => 0);
    for (let i = 0; i < 20; i++) expect(crew.pick('worker')?.tags).not.toContain('ad');
  });

  it('picks lines for the conditions', () => {
    const picker = new LinePicker([], () => 0.9);
    expect(picker.pick('mihalych', ['night'])?.tags).toContain('night');
    const pair = picker.radio({
      hour: 14,
      rain: false,
      snow: false,
      fog: false,
      wind: true,
      cold: false,
      heat: false,
      liftStop: true,
    });
    expect(RADIO_PAIRS).toContain(pair);
    expect(pair.tags === 'calm').toBe(false);
  });
});

describe('conversation context and radio handoff', () => {
  it('collects the job from the answers', () => {
    const ctx = job();
    expect(ctx.answers).toEqual(['Котлован под фундамент', 'Завтра']);
    expect(contextFacts(ctx)).toBe('котлован под фундамент, нужен JCB на завтра');
  });

  it('the next character hears the fields and asks only for what is missing', () => {
    const [call, answer] = radioHandoff('mihalych', 'sveta', job());
    expect(call!.text).toBe(
      'Света, приём! Тут человек: котлован под фундамент, нужен JCB на завтра.',
    );
    expect(answer!.speaker).toBe('sveta');
    // Short on the radio: the questions come once, in Света's own line.
    expect(answer!.text).toBe('Приняла, Михалыч. Здравствуйте!');
    const heard = { ...job(), heardBy: ['mihalych' as const] };
    expect(contextIntro(heard, 'rinat')).toBe(
      'Михалыч передал по рации: котлован под фундамент, нужен JCB на завтра.',
    );
  });

  it('prefills the order from the context', () => {
    const ctx = applyReply(job(), 'адрес', { address: 'Тукаевский район' });
    expect(orderSummary(ctx)).toBe(
      'Задача: котлован под фундамент. Техника: Экскаватор-погрузчик. Когда: завтра. Адрес: Тукаевский район. (со стройки на сайте)',
    );
    expect(wizardHref(ctx)).toBe('/?m=backhoe#podbor');
    expect(wizardHref(emptyContext(), 'crane')).toBe('/?m=crane#podbor');
    expect(wizardHref(emptyContext())).toBe('/#podbor');
    expect(orderSummary(emptyContext())).toBe('');
    expect(orderProgress(ctx).done).toBe(4);
    expect(orderProgress({ ...ctx, sent: true }).done).toBe(5);
    expect(renderLine('{task} — понял.', ctx)).toBe('Котлован под фундамент — понял.');
  });
});
