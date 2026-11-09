// Офис агентов (tasks/autopilot/2026-11-09-office-agents): общие типы двух агентов —
// «Сайты под ключ» и «Подрядчики». Строковые union-ы повторяют строки схемы
// (Prospect.kind / Prospect.status), enum-ов в базе нет (CLAUDE.md, правило 2).

export type AgentId = 'sites' | 'providers';

export type ProspectKind = 'site' | 'provider';

/**
 * NEW → READY → CONTACTED → CALLBACK | AGREED → PUBLISHED | DECLINED;
 * CONTACTED — кандидату отправлено письмо / сообщение WhatsApp (владелец, 2026-11-09);
 * REGISTERED — подрядчик зарегистрировался по ссылке со своей страницы.
 */
export type ProspectStatus =
  'NEW' | 'READY' | 'CONTACTED' | 'CALLBACK' | 'AGREED' | 'PUBLISHED' | 'DECLINED' | 'REGISTERED';

export const PROSPECT_STATUSES: readonly ProspectStatus[] = [
  'NEW',
  'READY',
  'CONTACTED',
  'CALLBACK',
  'AGREED',
  'PUBLISHED',
  'DECLINED',
  'REGISTERED',
];

/** Одна строка плана обхода: «агент; ниша; город». */
export interface PlanStep {
  agent: AgentId;
  niche: string;
  city: string;
}

/** Поля кандидата, нужные страницам и скриптам звонка (без id, заметок и дат). */
export interface ProspectView {
  name: string;
  phone: string;
  email: string | null;
  whatsapp: string | null;
  telegram: string | null;
  address: string | null;
  city: string | null;
  lat: number | null;
  lon: number | null;
  niche: string;
  /** Виды техники / услуги через запятую. */
  tags: string | null;
  hours: string | null;
  kind: ProspectKind;
  status: ProspectStatus;
  slug: string;
  token: string;
}
