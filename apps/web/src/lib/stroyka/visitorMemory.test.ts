import { describe, expect, it } from 'vitest';
import {
  CONSENT_DAYS,
  CONSENT_VERSION,
  MAX_CHARS,
  MEMORY_KEY,
  OFFER_PAUSE_MS,
  beginVisit,
  canOffer,
  cleanName,
  declineOffer,
  emptyMemory,
  forget,
  grantConsent,
  hasConsent,
  loadMemory,
  nameFromText,
  newSession,
  rememberFacts,
  sanitize,
  saveMemory,
  seedFromMemory,
  serialize,
  type VisitorMemory,
} from './visitorMemory';

/** An in-memory Storage. */
function store(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
}

const blocked = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
};

const NOW = Date.parse('2026-10-03T12:00:00Z');
const personal = {
  name: 'Марат',
  task: 'котлован под фундамент',
  machine: 'backhoe' as const,
  answers: ['Копать котлован'],
  sent: true,
  sentMachine: 'backhoe' as const,
};

describe('visitor memory storage', () => {
  it('forgets quietly when storage is blocked', () => {
    expect(loadMemory(blocked)).toEqual(emptyMemory());
    expect(saveMemory(emptyMemory(), blocked)).toBe(false);
    expect(loadMemory(null)).toEqual(emptyMemory());
    expect(newSession(blocked)).toBe(true);
  });

  it('survives corrupt JSON and junk fields', () => {
    expect(loadMemory(store({ [MEMORY_KEY]: '{not json' }))).toEqual(emptyMemory());
    expect(loadMemory(store({ [MEMORY_KEY]: '[1,2,3]' }))).toEqual(emptyMemory());
    const junk = JSON.stringify({
      visits: 'many',
      zones: ['gate', 'moon', 42],
      chapters: [2, -1, 'x'],
      last: 'yesterday',
      evil: '<script>',
    });
    expect(loadMemory(store({ [MEMORY_KEY]: junk }))).toEqual({
      visits: 0,
      zones: ['gate'],
      chapters: [2],
    });
  });

  it('keeps the stored JSON under the size cap', () => {
    const big: VisitorMemory = grantConsent(
      emptyMemory(),
      {
        ...personal,
        task: 'т'.repeat(500),
        answers: Array.from({ length: 50 }, () => 'о'.repeat(500)),
      },
      new Date(NOW),
      '2026-10-03',
    );
    big.zones = ['gate', 'kotlovan', 'planirovka', 'doroga', 'sklad', 'korpus', 'montazh'];
    big.chapters = Array.from({ length: 99 }, (_, i) => i + 1);
    big.greeting = 'g'.repeat(500);
    const json = serialize(big);
    expect(json.length).toBeLessThanOrEqual(MAX_CHARS);
    const back = JSON.parse(json) as VisitorMemory;
    expect(back.name).toBe('Марат');
    expect(back.task!.length).toBeLessThanOrEqual(80);
    expect(back.answers!.length).toBeLessThanOrEqual(6);
  });

  it('counts a visit once per browser session', () => {
    const s = store();
    expect(newSession(s)).toBe(true);
    expect(newSession(s)).toBe(false);
    const first = beginVisit(emptyMemory(), '2026-10-01', true);
    expect(first).toEqual({
      memory: { visits: 1, zones: [], chapters: [], last: '2026-10-01' },
      returning: false,
    });
    const again = beginVisit(first.memory, '2026-10-03', true);
    expect(again.returning).toBe(true);
    expect(again.memory.visits).toBe(2);
    expect(beginVisit(again.memory, '2026-10-03', false).returning).toBe(false);
  });
});

describe('consent', () => {
  it('stores nothing personal without consent', () => {
    const s = store();
    const sneaky = {
      ...emptyMemory(),
      ...personal,
      first: '2026-10-01',
      visits: 2,
    } as VisitorMemory;
    saveMemory(sneaky, s);
    const raw = s.data.get(MEMORY_KEY)!;
    for (const value of ['Марат', 'котлован', 'backhoe', 'Копать', 'sent', 'first'])
      expect(raw).not.toContain(value);
    expect(JSON.parse(raw)).toEqual({ visits: 2, zones: [], chapters: [] });
    // Facts offered before consent are ignored too.
    expect(rememberFacts(emptyMemory(), personal)).toEqual(emptyMemory());
  });

  it('remembers after «Да, запомни меня», with a dated record of the text version', () => {
    const s = store();
    const m = grantConsent(emptyMemory(), personal, new Date(NOW), '2026-10-03');
    saveMemory(m, s);
    const back = loadMemory(s);
    expect(hasConsent(back)).toBe(true);
    expect(back.consent).toEqual({ at: '2026-10-03T12:00:00.000Z', version: CONSENT_VERSION });
    expect(back).toMatchObject(personal);
    expect(rememberFacts(back, { machine: 'crane' }).machine).toBe('crane');
  });

  it('ignores a consent for another text version', () => {
    const raw = JSON.stringify({
      consent: { at: '2026-10-03', version: 'memory-consent-v0' },
      name: 'Марат',
    });
    const back = loadMemory(store({ [MEMORY_KEY]: raw }));
    expect(hasConsent(back)).toBe(false);
    expect(back.name).toBeUndefined();
  });

  it('wipes the personal memory and the consent on «Забыть меня»', () => {
    const s = store();
    const m = { ...grantConsent(emptyMemory(), personal, new Date(NOW), '2026-10-03'), visits: 3 };
    saveMemory(forget(m, NOW), s);
    const raw = s.data.get(MEMORY_KEY)!;
    expect(raw).not.toContain('Марат');
    expect(raw).not.toContain('consent');
    const back = loadMemory(s);
    expect(back).toEqual({ visits: 3, zones: [], chapters: [], declinedAt: NOW });
  });

  it('does not offer again for 7 days after «Не сейчас»', () => {
    const m = declineOffer(emptyMemory(), NOW);
    expect(canOffer(emptyMemory(), NOW)).toBe(true);
    expect(canOffer(m, NOW + 60_000)).toBe(false);
    expect(canOffer(m, NOW + OFFER_PAUSE_MS - 1)).toBe(false);
    expect(canOffer(m, NOW + OFFER_PAUSE_MS)).toBe(true);
    // The pause survives a reload.
    const s = store();
    saveMemory(m, s);
    expect(canOffer(loadMemory(s), NOW + 86_400_000)).toBe(false);
    // Nobody is asked twice after saying yes.
    expect(canOffer(grantConsent(m, {}, new Date(NOW), '2026-10-03'), NOW)).toBe(false);
  });
});

describe('names', () => {
  it('hears a name in the chat', () => {
    expect(nameFromText('Меня зовут Марат')).toBe('Марат');
    expect(nameFromText('здравствуйте, меня зовут марат, нужен JCB')).toBe('Марат');
    expect(nameFromText('Я Марат')).toBe('Марат');
    expect(nameFromText('это Алина!')).toBe('Алина');
  });

  it('does not take ordinary words for a name', () => {
    expect(nameFromText('я прораб')).toBeNull();
    expect(nameFromText('это бетон нужен на завтра')).toBeNull();
    expect(nameFromText('нужен экскаватор')).toBeNull();
    expect(cleanName('Имя не указано')).toBeNull();
    expect(cleanName('<b>Марат</b>')).toBeNull();
    expect(cleanName('  анна  мария ')).toBe('Анна Мария');
  });
});

describe('consent for 12 months, the visit starts from memory', () => {
  const DAY = 86_400_000;
  const at = new Date('2026-01-10T09:00:00Z');
  const remembered = () =>
    grantConsent(
      { ...emptyMemory(), visits: 1 },
      { name: 'Марат', task: 'котлован под фундамент', machine: 'backhoe', sent: true },
      at,
      '2026-01-10',
    );

  it('keeps the personal memory for less than 365 days, drops it after', () => {
    expect(CONSENT_DAYS).toBe(365);
    const raw = JSON.parse(JSON.stringify(remembered()));
    const inside = sanitize(raw, at.getTime() + 364 * DAY);
    expect(hasConsent(inside)).toBe(true);
    expect(inside.name).toBe('Марат');
    const after = sanitize(raw, at.getTime() + 365 * DAY);
    expect(hasConsent(after)).toBe(false);
    expect(after.name).toBeUndefined();
    expect(after.task).toBeUndefined();
    expect(after.sent).toBeUndefined();
    // Not personal, so kept without consent.
    expect(after.visits).toBe(1);
    // Loading and saving after expiry writes nothing personal back.
    const s = store({ [MEMORY_KEY]: JSON.stringify(raw) });
    const loaded = loadMemory(s, at.getTime() + 400 * DAY);
    expect(serialize(loaded, at.getTime() + 400 * DAY)).not.toContain('Марат');
  });

  it('seeds the job, the machine and the name only with consent', () => {
    expect(seedFromMemory(remembered())).toEqual({
      task: 'котлован под фундамент',
      machine: 'backhoe',
      name: 'Марат',
    });
    expect(seedFromMemory(forget(remembered(), at.getTime()))).toEqual({});
    expect(seedFromMemory(emptyMemory())).toEqual({});
  });

  it('remembers when the order went out', () => {
    const m = rememberFacts(remembered(), { sentAt: at.getTime() });
    expect(sanitize(JSON.parse(serialize(m, at.getTime())), at.getTime()).sentAt).toBe(
      at.getTime(),
    );
  });
});
