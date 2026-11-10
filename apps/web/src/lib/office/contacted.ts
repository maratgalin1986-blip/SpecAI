// Кому офис уже писал (ревью 2026-11-10): кандидаты при создании сверяются только по телефону
// и ссылке источника, поэтому у двух строк может быть одна почта (филиалы сети с общим ящиком)
// или один номер WhatsApp. Первое сообщение на адрес уходит один раз: строки с тем же адресом
// рассылка пропускает и закрывает им этот канал, чтобы очередь не стояла на дублях.

import { phoneDigits } from './pages';
import { emailKey } from './unsubscribe';

/** Цифры номера — ключ сравнения («+7 (917) 123-45-67» и «79171234567» — один номер). */
export function phoneKey(phone: string | null | undefined): string {
  return phone ? phoneDigits(phone) : '';
}

/** Адреса (emailKey) и номера (phoneKey), которым первое сообщение уже ушло, и когда. */
export interface ContactedContacts {
  emails: Map<string, Date>;
  phones: Map<string, Date>;
}

type ContactedMatch =
  | { emailSentAt: { not: null }; email: { in: string[]; mode: 'insensitive' } }
  | {
      whatsappSentAt: { not: null };
      OR: ({ phone: { in: string[] } } | { whatsapp: { in: string[] } })[];
    };

export interface ContactedDb {
  prospect: {
    findMany(args: {
      where: { OR: ContactedMatch[] };
      select: {
        email: true;
        phone: true;
        whatsapp: true;
        emailSentAt: true;
        whatsappSentAt: true;
      };
      take: number;
    }): Promise<
      {
        email: string | null;
        phone: string;
        whatsapp: string | null;
        emailSentAt: Date | null;
        whatsappSentAt: Date | null;
      }[]
    >;
  };
}

/** Больше строк с одним адресом за один запрос не читаем: это уже не дубли, а ошибка данных. */
const CONTACTED_TAKE = 1000;

function keepEarliest(map: Map<string, Date>, key: string, at: Date): void {
  const known = map.get(key);
  if (key && (!known || at.getTime() < known.getTime())) map.set(key, at);
}

/**
 * Какие из этих адресов и номеров уже получили первое сообщение — в любой строке, с любым
 * статусом. Номера передаются как записаны в базе (`phone`, `whatsapp`); у строки, которой
 * писали в WhatsApp, занятыми считаются оба её номера: лучше не написать, чем написать дважды.
 */
export async function contactedContacts(
  emails: readonly (string | null | undefined)[],
  phones: readonly (string | null | undefined)[],
  db: ContactedDb,
): Promise<ContactedContacts> {
  const emailKeys = [...new Set(emails.map(emailKey).filter((e) => e.length > 0))];
  const phoneValues = [...new Set(phones.map((p) => (p ?? '').trim()).filter((p) => p.length > 0))];
  const out: ContactedContacts = { emails: new Map(), phones: new Map() };
  const or: ContactedMatch[] = [];
  if (emailKeys.length > 0) {
    or.push({ emailSentAt: { not: null }, email: { in: emailKeys, mode: 'insensitive' } });
  }
  if (phoneValues.length > 0) {
    or.push({
      whatsappSentAt: { not: null },
      OR: [{ phone: { in: phoneValues } }, { whatsapp: { in: phoneValues } }],
    });
  }
  if (or.length === 0) return out;
  const rows = await db.prospect.findMany({
    where: { OR: or },
    select: { email: true, phone: true, whatsapp: true, emailSentAt: true, whatsappSentAt: true },
    take: CONTACTED_TAKE,
  });
  for (const row of rows) {
    if (row.emailSentAt) keepEarliest(out.emails, emailKey(row.email), row.emailSentAt);
    if (row.whatsappSentAt) {
      keepEarliest(out.phones, phoneKey(row.phone), row.whatsappSentAt);
      keepEarliest(out.phones, phoneKey(row.whatsapp), row.whatsappSentAt);
    }
  }
  return out;
}
