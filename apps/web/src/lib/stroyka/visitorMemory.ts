// What the /stroyka crew remember about a visitor (owner, 2026-10-03:
// «персонажи помнят, кто приходил», with a clear 152-ФЗ consent).
//
// First-party, on this device only: one small localStorage entry, no IP
// lookups, no fingerprinting, nothing sent anywhere. Without consent only
// non-personal things are kept (visit count, last visit date, zones and
// chapters seen, when the offer was declined). The name, what the visitor
// builds, the machine, chat answers and the order status are written only
// after «Да, запомни меня» — serialize() strips them otherwise, so no caller
// can store them by mistake. «Забыть меня» wipes them and the consent.
// The consent text is the section «Запоминание на этом устройстве» on /soglasie.
//
// Every access is wrapped: with storage blocked the site simply forgets.
// Read once on mount, written only on events, never per frame.

import { MACHINE_SLANG } from '@/lib/stroyka/context';
import { ZONES, type ZoneId } from '@/lib/stroyka';
import type { MachineType } from '@/lib/machinePhotos';

export const MEMORY_KEY = 'stroyka.memory.v1';
/** The session flag: a reload within one browser session is not a new visit. */
export const SESSION_KEY = 'stroyka.session.v1';
/** Upper bound of the stored JSON, in UTF-16 code units (about 2 KB). */
export const MAX_CHARS = 2048;
/** The text version the visitor agreed to (/soglasie#zapominanie). */
export const CONSENT_VERSION = 'memory-consent-v1';
/** The consent lasts 12 months (stated on /soglasie#zapominanie); then everything personal goes. */
export const CONSENT_DAYS = 365;
/** After «Не сейчас» (or «Забыть меня») the offer waits this long. */
export const OFFER_PAUSE_MS = 7 * 86_400_000;

export interface MemoryConsent {
  /** ISO date and time of «Да, запомни меня». */
  at: string;
  version: string;
}

export interface VisitorMemory {
  // ---- non-personal, kept without consent
  visits: number;
  /** Last visit, YYYY-MM-DD (Moscow). */
  last?: string;
  zones: ZoneId[];
  chapters: number[];
  /** The id of the last greeting, so the next one differs. */
  greeting?: string;
  /** When the offer was last declined (ms), for the 7-day pause. */
  declinedAt?: number;
  // ---- personal, only with consent
  consent?: MemoryConsent;
  name?: string;
  /** First visit, YYYY-MM-DD. */
  first?: string;
  machine?: MachineType;
  task?: string;
  /** The visitor's last few chat answers. */
  answers?: string[];
  /** An order went through; `sentMachine` is what it was for, `sentAt` when (ms). */
  sent?: boolean;
  sentMachine?: MachineType;
  sentAt?: number;
}

const PERSONAL = [
  'name',
  'first',
  'machine',
  'task',
  'answers',
  'sent',
  'sentMachine',
  'sentAt',
] as const satisfies readonly (keyof VisitorMemory)[];

export function emptyMemory(): VisitorMemory {
  return { visits: 0, zones: [], chapters: [] };
}

export const hasConsent = (m: VisitorMemory) => m.consent?.version === CONSENT_VERSION;

/** The memory without anything personal (what may be kept without consent). */
export function withoutPersonal(m: VisitorMemory): VisitorMemory {
  const out: VisitorMemory = { ...m, zones: [...m.zones], chapters: [...m.chapters] };
  for (const key of PERSONAL) delete out[key];
  delete out.consent;
  return out;
}

const ZONE_IDS = new Set<string>(ZONES.map((z) => z.id));
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown, max: number) =>
  typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined;
const machineOf = (v: unknown) =>
  typeof v === 'string' && Object.prototype.hasOwnProperty.call(MACHINE_SLANG, v)
    ? (v as MachineType)
    : undefined;

/** Whether a consent given at `at` (ISO) is still within CONSENT_DAYS at `now`. */
export function consentValid(at: string, now: number): boolean {
  const t = Date.parse(at);
  return !Number.isNaN(t) && now - t < CONSENT_DAYS * 86_400_000;
}

/**
 * Anything parsed from storage, made safe: unknown fields dropped, bad ones
 * ignored. A consent older than CONSENT_DAYS no longer counts, so the name,
 * the job and the order status are dropped with it.
 */
export function sanitize(raw: unknown, now: number = Date.now()): VisitorMemory {
  const m = emptyMemory();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return m;
  const r = raw as Record<string, unknown>;
  if (typeof r.visits === 'number' && Number.isFinite(r.visits))
    m.visits = Math.max(0, Math.min(9999, Math.floor(r.visits)));
  if (typeof r.last === 'string' && DATE.test(r.last)) m.last = r.last;
  if (Array.isArray(r.zones))
    m.zones = [...new Set(r.zones.filter((z): z is ZoneId => ZONE_IDS.has(z as string)))];
  if (Array.isArray(r.chapters))
    m.chapters = [
      ...new Set(
        r.chapters.filter(
          (c): c is number => Number.isInteger(c) && (c as number) > 0 && (c as number) <= 99,
        ),
      ),
    ];
  const greeting = str(r.greeting, 40);
  if (greeting) m.greeting = greeting;
  if (typeof r.declinedAt === 'number' && Number.isFinite(r.declinedAt) && r.declinedAt > 0)
    m.declinedAt = r.declinedAt;

  const c = r.consent as Record<string, unknown> | undefined;
  if (c && c.version === CONSENT_VERSION && typeof c.at === 'string' && consentValid(c.at, now))
    m.consent = { at: c.at, version: CONSENT_VERSION };
  if (!m.consent) return m;
  const name = cleanName(r.name);
  if (name) m.name = name;
  if (typeof r.first === 'string' && DATE.test(r.first)) m.first = r.first;
  const machine = machineOf(r.machine);
  if (machine) m.machine = machine;
  const task = str(r.task, 80);
  if (task) m.task = task;
  if (Array.isArray(r.answers)) {
    const answers = r.answers
      .map((a) => str(a, 60))
      .filter((a): a is string => !!a)
      .slice(-6);
    if (answers.length) m.answers = answers;
  }
  if (r.sent === true) m.sent = true;
  const sentMachine = machineOf(r.sentMachine);
  if (sentMachine) m.sentMachine = sentMachine;
  if (typeof r.sentAt === 'number' && Number.isFinite(r.sentAt) && r.sentAt > 0)
    m.sentAt = r.sentAt;
  return m;
}

/** A name as people write it: one or two words of letters, capitalised, or null. */
export function cleanName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.length > 2) return null;
  if (!words.every((w) => /^[A-Za-zА-Яа-яЁё-]{2,20}$/.test(w))) return null;
  if (words.some((w) => NOT_NAMES.has(w.toLowerCase()))) return null;
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
}

// Words that follow «я …» / «это …» but are not names.
const NOT_NAMES = new Set(
  (
    'не по из на за тут здесь хочу бы просто сам сама клиент заказчик прораб строитель ' +
    'частник от имя указано бетон экскаватор кран самосвал техника всё все да нет тоже ' +
    'насчёт насчет про он она мы они вы'
  ).split(' '),
);

/** «меня зовут Марат», «я Марат», «это Марат» → «Марат»; otherwise null. */
export function nameFromText(text: string): string | null {
  const t = text.trim();
  const named = t.match(/(?:меня зовут|зовут меня|моё имя|мое имя)\s+([A-Za-zА-Яа-яЁё-]{2,20})/i);
  if (named) return cleanName(named[1]!);
  // «я Марат» / «это Марат» only as a whole short message: «это бетон нужен» is not a name.
  const short = t.match(/^(?:я|это)\s*[—-]?\s*([A-Za-zА-Яа-яЁё-]{2,20})[.!]?$/i);
  return short ? cleanName(short[1]!) : null;
}

/** The JSON to store: nothing personal without consent, cut down until it fits MAX_CHARS. */
export function serialize(mem: VisitorMemory, now: number = Date.now()): string {
  const m = sanitize(JSON.parse(JSON.stringify(mem)), now);
  let json = JSON.stringify(m);
  // Least important first.
  const drops: (() => void)[] = [
    () => (m.chapters = []),
    () => (m.zones = []),
    () => delete m.answers,
    () => delete m.greeting,
    () => delete m.task,
  ];
  for (const drop of drops) {
    if (json.length <= MAX_CHARS) break;
    drop();
    json = JSON.stringify(m);
  }
  return json;
}

type Store = Pick<Storage, 'getItem' | 'setItem'>;

function local(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function session(): Store | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadMemory(store: Store | null = local(), now: number = Date.now()): VisitorMemory {
  try {
    const raw = store?.getItem(MEMORY_KEY);
    if (!raw || raw.length > MAX_CHARS * 4) return emptyMemory();
    return sanitize(JSON.parse(raw), now);
  } catch {
    return emptyMemory();
  }
}

export function saveMemory(mem: VisitorMemory, store: Store | null = local()): boolean {
  try {
    if (!store) return false;
    store.setItem(MEMORY_KEY, serialize(mem));
    return true;
  } catch {
    return false;
  }
}

/** Whether this page load starts a new browser session (and marks it started). */
export function newSession(store: Store | null = session()): boolean {
  try {
    if (!store) return true;
    if (store.getItem(SESSION_KEY)) return false;
    store.setItem(SESSION_KEY, '1');
    return true;
  } catch {
    return true;
  }
}

/**
 * A page load: a new session counts a visit. `returning` is true when the
 * visitor had been here in an earlier session.
 */
export function beginVisit(
  mem: VisitorMemory,
  today: string,
  isNewSession: boolean,
): { memory: VisitorMemory; returning: boolean } {
  if (!isNewSession) return { memory: mem, returning: false };
  return {
    memory: {
      ...mem,
      visits: mem.visits + 1,
      last: today,
      ...(hasConsent(mem) ? { first: mem.first ?? today } : {}),
    },
    returning: mem.visits > 0,
  };
}

/** Whether the crew may offer to remember the visitor now. */
export function canOffer(mem: VisitorMemory, now: number): boolean {
  if (hasConsent(mem)) return false;
  return !mem.declinedAt || now - mem.declinedAt >= OFFER_PAUSE_MS;
}

/** «Не сейчас»: no new offer for a week. */
export function declineOffer(mem: VisitorMemory, now: number): VisitorMemory {
  return { ...mem, declinedAt: now };
}

/** The personal facts of this visit, kept in memory (RAM) until consent. */
export type PersonalFacts = Partial<
  Pick<VisitorMemory, 'name' | 'machine' | 'task' | 'answers' | 'sent' | 'sentMachine' | 'sentAt'>
>;

/** «Да, запомни меня»: the consent record plus what is known already. */
export function grantConsent(
  mem: VisitorMemory,
  facts: PersonalFacts,
  now: Date,
  today: string,
): VisitorMemory {
  const next: VisitorMemory = {
    ...mem,
    consent: { at: now.toISOString(), version: CONSENT_VERSION },
    first: mem.first ?? today,
  };
  delete next.declinedAt;
  return rememberFacts(next, facts);
}

/** New personal facts; ignored without consent. */
export function rememberFacts(mem: VisitorMemory, facts: PersonalFacts): VisitorMemory {
  if (!hasConsent(mem)) return mem;
  const next = { ...mem };
  for (const [key, value] of Object.entries(facts) as [keyof PersonalFacts, unknown][]) {
    if (value === undefined || value === null || value === '') continue;
    (next as Record<string, unknown>)[key] = value;
  }
  return next;
}

/** «Забыть меня»: the personal memory and the consent go; the offer pauses a week. */
export function forget(mem: VisitorMemory, now: number): VisitorMemory {
  return { ...withoutPersonal(mem), declinedAt: now };
}

/**
 * What a returning visitor told last time, to start this visit with (consented
 * memory only): the job, the machine and the name, so the order and the form
 * are not empty while the characters say they remember.
 */
export function seedFromMemory(
  mem: VisitorMemory,
): Pick<VisitorMemory, 'task' | 'machine' | 'name'> {
  if (!hasConsent(mem)) return {};
  const out: Pick<VisitorMemory, 'task' | 'machine' | 'name'> = {};
  if (mem.task) out.task = mem.task;
  if (mem.machine) out.machine = mem.machine;
  if (mem.name) out.name = mem.name;
  return out;
}
