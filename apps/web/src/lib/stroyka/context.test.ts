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
import { LINES, LinePicker, RADIO_PAIRS } from '@/lib/stroyka/lines';
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
  it('has about 200 lines per character, unique ids', () => {
    for (const pool of Object.values(LINES)) {
      expect(pool.length).toBeGreaterThanOrEqual(190);
      expect(new Set(pool.map((l) => l.id)).size).toBe(pool.length);
    }
  });

  it('keeps Света and Ринат clean, comic swearing only as symbols', () => {
    for (const line of [...LINES.sveta, ...LINES.rinat]) expect(line.text).not.toMatch(CENSOR);
    for (const pool of Object.values(LINES))
      for (const line of pool) expect(line.text).not.toMatch(/СП16|SP16|сп16/i);
  });

  it('rotates company mentions rarely', () => {
    let ads = 0;
    const picker = new LinePicker();
    for (let i = 0; i < 600; i++) if (picker.pick('worker')?.tags.includes('ad')) ads++;
    expect(ads / 600).toBeLessThanOrEqual(1 / 6);
    expect(ads).toBeGreaterThan(0);
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
    expect(answer!.text).toContain('Котлован под фундамент, JCB, на завтра — записала');
    expect(answer!.text).toContain('Адрес точный скажете и телефон?');
    expect(answer!.text).not.toMatch(/когда|какой день/);
    const withAddress = applyReply(job(), 'адрес', { address: 'Тукаевский район' });
    expect(radioHandoff('mihalych', 'sveta', withAddress)[1]!.text).toContain('Оставьте телефон');
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
