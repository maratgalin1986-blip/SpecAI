import { describe, expect, it, vi } from 'vitest';
import type { SendEmailInput, SendEmailResult } from '@/lib/email';
import type { RateLimitOptions, RateLimitResult } from '@/lib/rateLimit';
import { checkRateLimit } from '@/lib/rateLimit';
import {
  acceptSiteLead,
  acceptsSiteLeads,
  buildSiteLeadEmail,
  FORWARD_ERROR_MAX,
  isSiteLeadHoneypot,
  SITE_LEAD_DAILY_CAP,
  SITE_LEAD_ERRORS,
  SITE_LEAD_IP_LIMIT,
  siteLeadForwardError,
  siteLeadSiteAddress,
  siteLeadTelegramText,
  type SiteLeadDb,
  type SiteLeadDeps,
  type SiteLeadProspect,
} from './siteLeads';

const NOW = new Date('2026-11-09T12:00:00+03:00');
const BASE = 'https://xn--24-6kc5aagh4arjl.xn--p1ai';

function site(over: Partial<SiteLeadProspect> = {}): SiteLeadProspect {
  return {
    id: 'prospect-secret-id',
    kind: 'site',
    status: 'PUBLISHED',
    slug: 'ulybka-kazan',
    name: 'Стоматология Улыбка',
    email: 'Info@Ulybka.ru',
    domain: null,
    siteJson: null,
    ...over,
  };
}

type Created = Parameters<SiteLeadDb['siteLead']['create']>[0]['data'];
type Updated = Parameters<SiteLeadDb['siteLead']['update']>[0];

function fakeDb(
  row: SiteLeadProspect | null,
  opts: { count?: number; failCreate?: boolean; failLookup?: boolean } = {},
) {
  const created: Created[] = [];
  const updated: Updated[] = [];
  const counted: { prospectId: string; gte: Date }[] = [];
  const db: SiteLeadDb = {
    prospect: {
      findUnique: async ({ where }) => {
        if (opts.failLookup) throw new Error('db down');
        return row && row.slug === where.slug ? row : null;
      },
    },
    siteLead: {
      count: async ({ where }) => {
        counted.push({ prospectId: where.prospectId, gte: where.createdAt.gte });
        return opts.count ?? 0;
      },
      create: async ({ data }) => {
        if (opts.failCreate) throw new Error('insert failed');
        created.push(data);
        return { id: `lead-${created.length}` };
      },
      update: async (args) => {
        updated.push(args);
        return {};
      },
    },
  };
  return { db, created, updated, counted };
}

function deps(
  db: SiteLeadDb,
  over: Partial<SiteLeadDeps> = {},
): SiteLeadDeps & {
  emails: SendEmailInput[];
  notes: string[];
} {
  const emails: SendEmailInput[] = [];
  const notes: string[] = [];
  return {
    db,
    sendEmail: async (input) => {
      emails.push(input);
      return { skipped: false, ok: true, id: 'email-1' };
    },
    notify: async (text) => {
      notes.push(text);
      return true;
    },
    now: () => NOW,
    rateLimit: () => ({ ok: true, retryAfterSec: 0 }),
    baseUrl: BASE,
    ...over,
    emails,
    notes,
  };
}

const BODY = {
  slug: 'ulybka-kazan',
  name: '  Анна  ',
  phone: '8 (927) 242-80-88',
  message: 'Нужна консультация',
  consent: true,
  website: '',
};

let ipCounter = 0;
const ip = () => `10.0.0.${++ipCounter}`;

describe('isSiteLeadHoneypot', () => {
  it('is true only for a filled hidden field', () => {
    expect(isSiteLeadHoneypot({ website: 'http://spam' })).toBe(true);
    expect(isSiteLeadHoneypot({ website: 0 })).toBe(true);
    expect(isSiteLeadHoneypot({ website: '' })).toBe(false);
    expect(isSiteLeadHoneypot({ website: null })).toBe(false);
    expect(isSiteLeadHoneypot({})).toBe(false);
    expect(isSiteLeadHoneypot(null)).toBe(false);
    expect(isSiteLeadHoneypot('website')).toBe(false);
  });
});

describe('acceptSiteLead — ловушка и поля', () => {
  it('a bot that filled the trap gets ok, nothing is saved, sent or counted', async () => {
    const { db, created } = fakeDb(site());
    const rateLimit = vi.fn(() => ({ ok: true, retryAfterSec: 0 }));
    const d = deps(db, { rateLimit });
    const outcome = await acceptSiteLead({ body: { ...BODY, website: 'spam.ru' }, ip: ip() }, d);
    expect(outcome).toEqual({ status: 200, body: { ok: true } });
    expect(created).toHaveLength(0);
    expect(d.emails).toHaveLength(0);
    expect(d.notes).toHaveLength(0);
    expect(rateLimit).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...BODY, slug: 'Bad Slug!' }, 'Обновите страницу'],
    [{ ...BODY, slug: undefined }, 'Обновите страницу'],
    [{ ...BODY, name: '   ' }, 'Напишите имя'],
    [{ ...BODY, name: 'а'.repeat(81) }, 'не длиннее 80'],
    [{ ...BODY, phone: '12345' }, 'российский номер'],
    [{ ...BODY, phone: '+7 927 242-80-88 доб. 123456789012345' }, 'российский номер'],
    [{ ...BODY, message: 'а'.repeat(1001) }, 'не длиннее 1000'],
    [{ ...BODY, consent: false }, 'согласие'],
    [{ ...BODY, consent: 'true' }, 'согласие'],
  ])('rejects invalid input with a Russian message (%#)', async (body, text) => {
    const { db, created } = fakeDb(site());
    const outcome = await acceptSiteLead({ body, ip: ip() }, deps(db));
    expect(outcome.status).toBe(400);
    expect('error' in outcome.body && outcome.body.error).toContain(text);
    expect(created).toHaveLength(0);
  });

  it('rejects a body that is not an object', async () => {
    const { db } = fakeDb(site());
    const outcome = await acceptSiteLead({ body: null, ip: ip() }, deps(db));
    expect(outcome.status).toBe(400);
  });

  it('saves the normalized phone, a one-line name and the comment; empty comment → null', async () => {
    const { db, created } = fakeDb(site());
    await acceptSiteLead(
      { body: { ...BODY, name: ' Анна\n\tПетровна ', message: '  ' }, ip: ip() },
      deps(db),
    );
    expect(created).toEqual([
      {
        prospectId: 'prospect-secret-id',
        name: 'Анна Петровна',
        phone: '+79272428088',
        message: null,
        createdAt: NOW,
      },
    ]);
  });

  it('accepts a landline number from the card format and a missing comment', async () => {
    const { db, created } = fakeDb(site());
    const withoutMessage: Record<string, unknown> = { ...BODY };
    delete withoutMessage.message;
    const outcome = await acceptSiteLead(
      { body: { ...withoutMessage, phone: '8 (843) 212-34-56' }, ip: ip() },
      deps(db),
    );
    expect(outcome.status).toBe(200);
    expect(created[0]!.phone).toBe('+78432123456');
    expect(created[0]!.message).toBeNull();
  });
});

describe('acceptSiteLead — какой сайт принимает заявки', () => {
  it.each([
    ['не опубликован', site({ status: 'READY' })],
    ['согласился, но ещё не опубликован', site({ status: 'AGREED' })],
    ['отказался', site({ status: 'DECLINED' })],
    ['страница подрядчика', site({ kind: 'provider' })],
    ['форма выключена в редакторе', site({ siteJson: JSON.stringify({ leadForm: false }) })],
  ])('404 when the site is %s', async (_label, row) => {
    const { db, created } = fakeDb(row);
    const d = deps(db);
    const outcome = await acceptSiteLead({ body: BODY, ip: ip() }, d);
    expect(outcome).toEqual({ status: 404, body: { error: SITE_LEAD_ERRORS.closed } });
    expect(created).toHaveLength(0);
    expect(d.emails).toHaveLength(0);
    expect(d.notes).toHaveLength(0);
  });

  it('404 for an unknown slug', async () => {
    const { db } = fakeDb(site());
    const outcome = await acceptSiteLead(
      { body: { ...BODY, slug: 'drugoj-sajt' }, ip: ip() },
      deps(db),
    );
    expect(outcome.status).toBe(404);
  });

  it('the form is on by default, with the switch on and with broken edits', () => {
    expect(acceptsSiteLeads(site())).toBe(true);
    expect(acceptsSiteLeads(site({ siteJson: JSON.stringify({ leadForm: true }) }))).toBe(true);
    expect(acceptsSiteLeads(site({ siteJson: '{broken' }))).toBe(true);
    expect(acceptsSiteLeads(site({ siteJson: JSON.stringify({ leadForm: false }) }))).toBe(false);
  });

  it('503 when the database cannot be read', async () => {
    const { db } = fakeDb(site(), { failLookup: true });
    const d = deps(db);
    const outcome = await acceptSiteLead({ body: BODY, ip: ip() }, d);
    expect(outcome).toEqual({ status: 503, body: { error: SITE_LEAD_ERRORS.unavailable } });
    expect(d.emails).toHaveLength(0);
  });
});

describe('acceptSiteLead — лимиты', () => {
  it('uses the IP key and the 5-per-10-minutes limit; 429 with Retry-After', async () => {
    const { db, created } = fakeDb(site());
    const calls: [string, RateLimitOptions][] = [];
    const rateLimit = (key: string, options: RateLimitOptions): RateLimitResult => {
      calls.push([key, options]);
      return { ok: false, retryAfterSec: 321 };
    };
    const outcome = await acceptSiteLead({ body: BODY, ip: '1.2.3.4' }, deps(db, { rateLimit }));
    expect(calls).toEqual([['site-lead:ip:1.2.3.4', SITE_LEAD_IP_LIMIT]]);
    expect(SITE_LEAD_IP_LIMIT).toEqual({ limit: 5, windowMs: 600_000 });
    expect(outcome).toEqual({
      status: 429,
      body: { error: SITE_LEAD_ERRORS.tooManyFromIp },
      retryAfterSec: 321,
    });
    expect(created).toHaveLength(0);
  });

  it('the sixth lead from one IP within 10 minutes is refused (real in-memory limiter)', async () => {
    const { db, created } = fakeDb(site());
    const d = deps(db, { rateLimit: checkRateLimit });
    const address = `192.168.77.${Date.now() % 250}`;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await acceptSiteLead({ body: BODY, ip: address }, d)).status);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 429]);
    expect(created).toHaveLength(5);
  });

  it('counts the leads of this site over the last 24 hours and stops at the daily cap', async () => {
    const full = fakeDb(site(), { count: SITE_LEAD_DAILY_CAP });
    const d = deps(full.db);
    const outcome = await acceptSiteLead({ body: BODY, ip: ip() }, d);
    expect(outcome).toEqual({ status: 429, body: { error: SITE_LEAD_ERRORS.dailyCap } });
    expect(full.created).toHaveLength(0);
    expect(d.emails).toHaveLength(0);
    expect(full.counted).toEqual([
      { prospectId: 'prospect-secret-id', gte: new Date(NOW.getTime() - 86_400_000) },
    ]);

    const almost = fakeDb(site(), { count: SITE_LEAD_DAILY_CAP - 1 });
    expect((await acceptSiteLead({ body: BODY, ip: ip() }, deps(almost.db))).status).toBe(200);
    expect(almost.created).toHaveLength(1);
  });
});

describe('acceptSiteLead — пересылка компании и строка владельцу', () => {
  it('emails the company, marks forwardedAt and tells the owner in one line', async () => {
    const { db, updated } = fakeDb(site());
    const d = deps(db);
    const outcome = await acceptSiteLead({ body: BODY, ip: ip() }, d);
    expect(outcome).toEqual({ status: 200, body: { ok: true } });
    expect(d.emails).toHaveLength(1);
    expect(d.emails[0]!.to).toBe('info@ulybka.ru');
    expect(d.emails[0]!.subject).toBe('Заявка с сайта: Анна');
    expect(d.emails[0]!.text).toContain('+7 927 242-80-88');
    expect(d.emails[0]!.text).toContain(`${BASE}/s/ulybka-kazan`);
    expect(updated).toEqual([{ where: { id: 'lead-1' }, data: { forwardedAt: NOW } }]);
    expect(d.notes).toEqual(['Заявка с сайта «Стоматология Улыбка»: Анна, +7 927 242-80-88']);
  });

  it('no e-mail of the company → forwardError, nothing sent, the owner learns it was not delivered', async () => {
    const { db, updated } = fakeDb(site({ email: null }));
    const d = deps(db);
    const outcome = await acceptSiteLead({ body: BODY, ip: ip() }, d);
    expect(outcome.status).toBe(200);
    expect(d.emails).toHaveLength(0);
    const error = siteLeadForwardError('no-email');
    expect(error).toMatch(/не указана почта/);
    expect(updated).toEqual([{ where: { id: 'lead-1' }, data: { forwardError: error } }]);
    expect(d.notes).toHaveLength(1);
    expect(d.notes[0]).toContain('не доставлена клиенту');
    expect(d.notes[0]).not.toContain('\n');
  });

  it('mail not configured → a Russian forwardError', async () => {
    const { db, updated } = fakeDb(site());
    const sendEmail = async (): Promise<SendEmailResult> => ({
      skipped: true,
      reason: 'RESEND_API_KEY is not set',
    });
    await acceptSiteLead({ body: BODY, ip: ip() }, deps(db, { sendEmail }));
    expect(updated[0]!.data.forwardError).toBe(siteLeadForwardError('not-configured'));
    expect(updated[0]!.data.forwardError).toMatch(/не настроена/);
  });

  it('a send error is kept in Russian, on one line and within the limit', async () => {
    const { db, updated } = fakeDb(site());
    const sendEmail = async (): Promise<SendEmailResult> => ({
      skipped: false,
      ok: false,
      error: `Domain not verified\n${'x'.repeat(500)}`,
    });
    const d = deps(db, { sendEmail });
    await acceptSiteLead({ body: BODY, ip: ip() }, d);
    const error = updated[0]!.data.forwardError!;
    expect(error.startsWith('Письмо компании не отправлено: Domain not verified')).toBe(true);
    expect(error.length).toBeLessThanOrEqual(FORWARD_ERROR_MAX);
    expect(error).not.toContain('\n');
    expect(d.notes[0]).toContain('не доставлена клиенту');
  });

  it('a hanging mail service does not hold the visitor: timeout → forwardError', async () => {
    const { db, updated } = fakeDb(site());
    const sendEmail = () => new Promise<SendEmailResult>(() => {});
    const outcome = await acceptSiteLead(
      { body: BODY, ip: ip() },
      deps(db, { sendEmail, sendTimeoutMs: 10 }),
    );
    expect(outcome.status).toBe(200);
    expect(updated[0]!.data.forwardError).toMatch(/не ответила/);
  });

  it('a lead that was not saved still goes to the company; lost everywhere → 503', async () => {
    const saveFails = fakeDb(site(), { failCreate: true });
    const ok = deps(saveFails.db);
    expect((await acceptSiteLead({ body: BODY, ip: ip() }, ok)).status).toBe(200);
    expect(ok.emails).toHaveLength(1);
    expect(ok.notes[0]).toContain('в базе не сохранена');
    expect(saveFails.updated).toHaveLength(0);

    const lost = deps(fakeDb(site({ email: null }), { failCreate: true }).db, {
      notify: async () => false,
    });
    expect(await acceptSiteLead({ body: BODY, ip: ip() }, lost)).toEqual({
      status: 503,
      body: { error: SITE_LEAD_ERRORS.unavailable },
    });
  });

  it('a failing Telegram does not fail a saved lead', async () => {
    const { db } = fakeDb(site());
    const notify = async (): Promise<boolean> => {
      throw new Error('telegram down');
    };
    expect((await acceptSiteLead({ body: BODY, ip: ip() }, deps(db, { notify }))).status).toBe(200);
  });

  it('the answer carries no id, name, phone or e-mail of anyone', async () => {
    const outcomes = [
      await acceptSiteLead({ body: BODY, ip: ip() }, deps(fakeDb(site()).db)),
      await acceptSiteLead({ body: BODY, ip: ip() }, deps(fakeDb(site({ status: 'READY' })).db)),
      await acceptSiteLead(
        { body: BODY, ip: ip() },
        deps(fakeDb(site(), { count: SITE_LEAD_DAILY_CAP }).db),
      ),
    ];
    for (const outcome of outcomes) {
      const json = JSON.stringify(outcome.body);
      for (const secret of ['prospect-secret-id', 'lead-1', 'Улыбка', 'ulybka', 'Анна', '927']) {
        expect(json).not.toContain(secret);
      }
    }
  });
});

describe('buildSiteLeadEmail', () => {
  it('escapes everything the visitor typed in the HTML and keeps the text readable', () => {
    const letter = buildSiteLeadEmail({
      name: '<script>alert(1)</script> & Co',
      phone: '+79272428088',
      message: 'Строка 1\n<img src=x onerror="alert(2)">\n"кавычки" & \'апостроф\'',
      siteAddress: 'https://ulybka.ru',
    });
    expect(letter.html).not.toContain('<script>');
    expect(letter.html).not.toContain('<img');
    expect(letter.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co');
    expect(letter.html).toContain('&lt;img src=x onerror=&quot;alert(2)&quot;&gt;');
    expect(letter.html).toContain('&#39;апостроф&#39;');
    expect(letter.html).toContain('Строка 1<br>');
    expect(letter.html).toContain('<a href="tel:+79272428088">+7 927 242-80-88</a>');
    expect(letter.html).toContain('<a href="https://ulybka.ru">https://ulybka.ru</a>');
    expect(letter.subject).toBe('Заявка с сайта: <script>alert(1)</script> & Co');
    expect(letter.text).toContain('Комментарий:\nСтрока 1\n<img');
  });

  it('says where the lead came from and who made the site', () => {
    const letter = buildSiteLeadEmail({
      name: 'Анна',
      phone: '+78432123456',
      message: null,
      siteAddress: `${BASE}/s/ulybka-kazan`,
    });
    const origin = `Заявка пришла с вашего сайта ${BASE}/s/ulybka-kazan. Сайт сделан ИИСтройка24 от СпецПласт16.`;
    expect(letter.text).toContain(origin);
    expect(letter.text).not.toContain('Комментарий');
    expect(letter.html).toContain('Сайт сделан ИИСтройка24 от СпецПласт16.');
    expect(letter.text).toContain('+7 843 212-34-56');
  });

  it('keeps the subject on one line', () => {
    expect(
      buildSiteLeadEmail({
        name: 'Анна\r\nBcc: x@y.z',
        phone: '+79272428088',
        message: null,
        siteAddress: BASE,
      }).subject,
    ).toBe('Заявка с сайта: Анна Bcc: x@y.z');
  });
});

describe('siteLeadSiteAddress', () => {
  const withDomain = { slug: 'ulybka-kazan', domain: 'ulybka-kazan.ru' };

  it('the client domain when the lead came through it (with or without www)', () => {
    expect(siteLeadSiteAddress(withDomain, 'ulybka-kazan.ru', BASE)).toBe(
      'https://ulybka-kazan.ru',
    );
    expect(siteLeadSiteAddress(withDomain, 'WWW.Ulybka-Kazan.ru:443', BASE)).toBe(
      'https://ulybka-kazan.ru',
    );
  });

  it('/s/<slug> on the platform otherwise — another host never takes over', () => {
    expect(siteLeadSiteAddress(withDomain, 'evil.example', `${BASE}/`)).toBe(
      `${BASE}/s/ulybka-kazan`,
    );
    expect(siteLeadSiteAddress(withDomain, null, BASE)).toBe(`${BASE}/s/ulybka-kazan`);
    expect(
      siteLeadSiteAddress({ slug: 'ulybka-kazan', domain: null }, 'ulybka-kazan.ru', BASE),
    ).toBe(`${BASE}/s/ulybka-kazan`);
  });

  it('the e-mail uses the domain address when the request host is the client domain', async () => {
    const { db } = fakeDb(site({ domain: 'ulybka-kazan.ru' }));
    const d = deps(db);
    await acceptSiteLead({ body: BODY, ip: ip(), host: 'www.ulybka-kazan.ru' }, d);
    expect(d.emails[0]!.text).toContain('Заявка пришла с вашего сайта https://ulybka-kazan.ru.');
  });
});

describe('siteLeadTelegramText', () => {
  it('one line with the company, the name and the phone', () => {
    expect(
      siteLeadTelegramText(
        'Автомойка\n«Блеск»',
        { name: 'Иван', phone: '+79272428088' },
        { forwardError: null, saved: true },
      ),
    ).toBe('Заявка с сайта Автомойка «Блеск»: Иван, +7 927 242-80-88');
  });

  it('adds why it was not delivered', () => {
    const text = siteLeadTelegramText(
      'Улыбка',
      { name: 'Иван', phone: '+79272428088' },
      { forwardError: siteLeadForwardError('no-email'), saved: false },
    );
    expect(text).toContain('не доставлена клиенту (У компании не указана почта');
    expect(text).toContain('в базе не сохранена');
    expect(text).not.toContain('\n');
  });
});
