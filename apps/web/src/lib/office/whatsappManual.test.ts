import { describe, expect, it, vi } from 'vitest';

vi.mock('@specai/database', () => ({ prisma: {} }));

const { emptyQueueNotes, manualWhatsAppQueue, TO_PHONE_LABEL } = await import('./whatsappManual');
type ManualDb = import('./whatsappManual').ManualDb;
type ManualDeps = import('./whatsappManual').ManualDeps;
type ManualRow = import('./whatsappManual').ManualRow;

const NOW = new Date('2026-11-10T09:00:00Z');

function row(n: number, over: Partial<ManualRow> = {}): ManualRow {
  return {
    id: `p${n}`,
    kind: 'provider',
    status: 'READY',
    slug: `firm-${n}`,
    token: `tok${n}`,
    name: `Фирма ${n}`,
    phone: `+7900000000${n}`,
    email: null,
    whatsapp: `+7911000000${n}`,
    address: null,
    city: 'Казань',
    lat: null,
    lon: null,
    niche: 'machinery',
    tags: null,
    hours: null,
    dossierJson: null,
    offerJson: null,
    ...over,
  };
}

/** База в памяти: счётчики считаются по тем же условиям, что уходят в запрос. */
function fakeDb(rows: ManualRow[], sentToday = 0) {
  const counts: unknown[] = [];
  const db: ManualDb = {
    prospect: {
      async count({ where }) {
        counts.push(where);
        if ('status' in where) {
          return rows.filter(
            (r) =>
              (!where.whatsapp || r.whatsapp?.startsWith(where.whatsapp.startsWith)) &&
              (!where.phone || r.phone.startsWith(where.phone.startsWith)),
          ).length;
        }
        return sentToday;
      },
      async findMany({ where }) {
        const byPhone = (where.OR ?? []).some((m) => 'phone' in m);
        return rows.filter(
          (r) => r.whatsapp?.startsWith('+79') || (byPhone && r.phone.startsWith('+79')),
        );
      },
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  };
  return { db, counts };
}

function deps(db: ManualDb, over: Partial<ManualDeps> = {}): ManualDeps {
  return {
    db,
    settings: async () => ({
      dailyCap: 20,
      outreachPaused: false,
      whatsappToPhone: false,
      replyTo: 'office@example.ru',
    }),
    prices: async () => ({ setup: 1, monthly: 1 }) as never,
    baseUrl: () => 'https://example.ru',
    optedOut: async () => ({ emails: new Set<string>(), phones: new Set<string>() }),
    angleStats: async () => new Map(),
    ...over,
  };
}

describe('manualWhatsAppQueue', () => {
  it('coverage — только счётчики: все, с пометкой WhatsApp, с мобильным, настройка', async () => {
    const { db, counts } = fakeDb([
      row(1),
      row(2, { whatsapp: null }),
      row(3, { whatsapp: null, phone: '+78552000000' }),
    ]);
    const queue = await manualWhatsAppQueue(NOW, deps(db));
    expect(queue.coverage).toEqual({ ready: 3, withWhatsappTag: 1, withMobile: 2, toPhone: false });
    expect(queue.items.map((i) => i.id)).toEqual(['p1']);
    // Счёт идёт только по тем, кому не писали и кто не отписался.
    expect(counts[1]).toEqual({
      status: { in: ['READY', 'CONTACTED'] },
      whatsappSentAt: null,
      optOutAt: null,
    });
  });

  it('coverage считается и на паузе, очередь при этом пуста', async () => {
    const { db } = fakeDb([row(1)]);
    const queue = await manualWhatsAppQueue(
      NOW,
      deps(db, {
        settings: async () => ({
          dailyCap: 20,
          outreachPaused: true,
          whatsappToPhone: true,
          replyTo: '',
        }),
      }),
    );
    expect(queue.items).toEqual([]);
    expect(queue.coverage).toEqual({ ready: 1, withWhatsappTag: 1, withMobile: 1, toPhone: true });
  });

  it('отписанный номер в очередь не попадает', async () => {
    const { db } = fakeDb([row(1), row(2)]);
    const queue = await manualWhatsAppQueue(
      NOW,
      deps(db, {
        optedOut: async () => ({ emails: new Set<string>(), phones: new Set(['+79110000001']) }),
      }),
    );
    expect(queue.items.map((i) => i.id)).toEqual(['p2']);
    expect(JSON.stringify(queue.items)).not.toContain('79110000001');
  });

  it('дневной лимит режет очередь', async () => {
    const { db } = fakeDb([row(1), row(2), row(3), row(4)], 18);
    const queue = await manualWhatsAppQueue(NOW, deps(db));
    expect(queue.sentToday).toBe(18);
    expect(queue.items).toHaveLength(2);
    const full = await manualWhatsAppQueue(NOW, deps(fakeDb([row(1)], 20).db));
    expect(full.items).toEqual([]);
  });
});

describe('emptyQueueNotes', () => {
  const base = { sentToday: 0, dailyCap: 20, paused: false };

  it('фирм нет — очередь появится сама', () => {
    expect(
      emptyQueueNotes({
        ...base,
        coverage: { ready: 0, withWhatsappTag: 0, withMobile: 0, toPhone: false },
      }),
    ).toEqual(['Поиск ещё не нашёл фирм с номером — очередь появится сама.']);
  });

  it('мобильных больше, чем пометок WhatsApp, и флажок выключен — подсказка с его подписью', () => {
    const notes = emptyQueueNotes({
      ...base,
      coverage: { ready: 7, withWhatsappTag: 0, withMobile: 5, toPhone: false },
    });
    expect(notes[0]).toBe(
      'Фирм, которым ещё не писали: 7. С пометкой WhatsApp в карточке — 0, с мобильным номером — 5.',
    );
    expect(notes[1]).toContain(`«${TO_PHONE_LABEL}»`);
  });

  it('флажок включён или пауза — подсказки про флажок нет', () => {
    const coverage = { ready: 7, withWhatsappTag: 0, withMobile: 5, toPhone: true };
    expect(emptyQueueNotes({ ...base, coverage })).toHaveLength(1);
    expect(emptyQueueNotes({ ...base, paused: true, coverage })).toEqual([]);
  });
});
