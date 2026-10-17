// The admin's callback list (/admin#leads): new ones first, a status
// filter and a readable source. Pure, unit-tested.

import { DIRECT, formLabel, splitSource } from './marketing';

export type LeadFilter = 'all' | 'new' | 'work' | 'done';

export const LEAD_FILTERS: { id: LeadFilter; label: string }[] = [
  { id: 'all', label: 'Все' },
  { id: 'new', label: 'Новые' },
  { id: 'work', label: 'В работе' },
  { id: 'done', label: 'Обработаны' },
];

const STATUS_OF: Record<Exclude<LeadFilter, 'all'>, string> = {
  new: 'NEW',
  work: 'IN_PROGRESS',
  done: 'DONE',
};

const RANK: Record<string, number> = { NEW: 0, IN_PROGRESS: 1, DONE: 2 };

export function parseLeadFilter(value: string | string[] | undefined): LeadFilter {
  const raw = Array.isArray(value) ? value[0] : value;
  return LEAD_FILTERS.some((item) => item.id === raw) ? (raw as LeadFilter) : 'all';
}

interface LeadLike {
  status: string;
  createdAt: Date;
}

/** New first, then in work, then done; newest first inside each. */
export function sortLeads<T extends LeadLike>(leads: T[]): T[] {
  return [...leads].sort(
    (a, b) =>
      (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) ||
      b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

export function filterLeads<T extends LeadLike>(leads: T[], filter: LeadFilter): T[] {
  return filter === 'all' ? leads : leads.filter((lead) => lead.status === STATUS_OF[filter]);
}

export function leadFilterCounts(leads: LeadLike[]): Record<LeadFilter, number> {
  return {
    all: leads.length,
    new: filterLeads(leads, 'new').length,
    work: filterLeads(leads, 'work').length,
    done: filterLeads(leads, 'done').length,
  };
}

// Channel tokens of the older «channel|form» sources (API clients, tests)
// and of bare sources without the site's « · » separator.
const CHANNEL_LABELS: Record<string, string> = {
  yandex: 'Яндекс Директ',
  direct: 'Яндекс Директ',
  google: 'Google',
  site: 'Сайт',
  web: 'Сайт',
  avito: 'Авито',
  '2gis': '2ГИС',
  telegram: 'Telegram',
  whatsapp: 'WhatsApp',
  vk: 'ВКонтакте',
  bot: 'Бот',
};

// Form tokens the site's FORM_LABELS do not know.
const EXTRA_FORMS: Record<string, string> = {
  hero: 'Главная, форма звонка',
  callback: 'Форма звонка',
  chat: 'Чат',
};

function formOrToken(token: string): string {
  const kind = token.trim();
  return EXTRA_FORMS[kind.toLowerCase()] ?? formLabel(kind);
}

/**
 * A lead's source as the admin reads it: «Главная, форма звонка · Яндекс
 * Директ» for the site's "home · Яндекс Директ", «Яндекс Директ · Главная,
 * форма звонка» for an older "yandex|hero"; `null` when there is none.
 */
export function leadSourceLabel(source: string | null | undefined): string | null {
  const raw = (source ?? '').trim();
  if (!raw) return null;
  if (raw.includes(' · ')) {
    const { form, channel } = splitSource(raw);
    return `${formLabel(form)} · ${channel}`;
  }
  if (raw.includes('|')) {
    const [channelToken = '', ...rest] = raw.split('|');
    const channel = CHANNEL_LABELS[channelToken.trim().toLowerCase()] ?? channelToken.trim();
    const form = rest.join('|').trim();
    return form ? `${formOrToken(form)} · ${channel}` : channel;
  }
  const known = CHANNEL_LABELS[raw.toLowerCase()];
  if (known) return known;
  const label = formOrToken(raw);
  return label === 'Без отметки' ? DIRECT : label;
}
