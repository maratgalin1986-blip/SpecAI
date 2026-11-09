// Офис агентов: разрешённые переходы статуса кандидата по отметке владельца
// (spec §6, §12; R15). Чистая функция — маршрут PATCH /api/admin/office/prospects/[id]
// только применяет результат к строке Prospect.
//
// READY | CONTACTED | CALLBACK → «Согласился», «Напомнить» (CALLBACK с датой),
// «Отказ» (DECLINED), «Ответил» (только отметка repliedAt);
// «Согласился» у подрядчика (kind provider) сразу публикует (PUBLISHED); у клиентского сайта
// (kind site, К10) — только AGREED: сайт публикует отдельное «Опубликовать» (AGREED →
// PUBLISHED), обычно после оплаты и оферты;
// AGREED (сайт) → «Опубликовать» или «Отказ»;
// PUBLISHED | REGISTERED → только «Отказ» (снять с публикации);
// DECLINED → только «Согласился» (подрядчик — снова на публикацию, сайт — снова AGREED);
// заметка — всегда, статус не меняется.

import type { ProspectStatus } from './types';

export type ProspectAction = 'agree' | 'callback' | 'decline' | 'note' | 'replied' | 'publish';

export const PROSPECT_ACTIONS: readonly ProspectAction[] = [
  'agree',
  'callback',
  'decline',
  'note',
  'replied',
  'publish',
];

/** Подтверждение перед публикацией неоплаченного сайта (К10): спрашивает админка и маршрут. */
export const PUBLISH_UNPAID_QUESTION = 'Сайт не оплачен — опубликовать?';

export interface ActionData {
  agreedAt: Date;
  publishedAt: Date;
  declinedAt: Date;
  callAt: Date | null;
  repliedAt: Date;
}

export type ActionResult =
  { ok: true; status: ProspectStatus; data: Partial<ActionData> } | { ok: false; error: string };

const OPEN: readonly ProspectStatus[] = ['READY', 'CONTACTED', 'CALLBACK'];
const PUBLIC: readonly ProspectStatus[] = ['PUBLISHED', 'REGISTERED'];

const STATUS_TITLES: Record<ProspectStatus, string> = {
  NEW: 'новый',
  READY: 'готов к отправке',
  CONTACTED: 'написали',
  CALLBACK: 'напомнить',
  AGREED: 'согласился',
  PUBLISHED: 'опубликован',
  DECLINED: 'отказ',
  REGISTERED: 'зарегистрировался',
};

const ACTION_TITLES: Record<ProspectAction, string> = {
  agree: '«Согласился»',
  callback: '«Напомнить»',
  decline: '«Отказ»',
  note: 'заметка',
  replied: '«Ответил»',
  publish: '«Опубликовать»',
};

/** Московская дата YYYY-MM-DD; Москва без перевода часов — смещение +03:00 точное. */
function mskDay(date: Date): string {
  return new Date(date.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
}

function cannot(status: ProspectStatus, action: ProspectAction, allowed: string): ActionResult {
  return {
    ok: false,
    error: `Так отметить нельзя: кандидат «${STATUS_TITLES[status]}», ${ACTION_TITLES[action]} не подходит. ${allowed}`,
  };
}

/**
 * Новый статус кандидата по отметке владельца. `kind` — 'site' или 'provider' (что угодно,
 * кроме 'site', ведёт себя как подрядчик — как было до К10).
 */
export function applyAction(
  status: ProspectStatus,
  action: ProspectAction,
  now: Date,
  callAt?: Date | null,
  kind: string = 'provider',
): ActionResult {
  if (action === 'note') return { ok: true, status, data: {} };
  const site = kind === 'site';

  if (action === 'publish') {
    if (site && status === 'AGREED') {
      return { ok: true, status: 'PUBLISHED', data: { publishedAt: now } };
    }
    return {
      ok: false,
      error: site
        ? `Так отметить нельзя: кандидат «${STATUS_TITLES[status]}». Опубликовать можно сайт, с которым договорились («Согласился»).`
        : 'Так отметить нельзя: страница подрядчика публикуется сразу по «Согласился».',
    };
  }

  if (site && status === 'AGREED') {
    if (action === 'decline') {
      return { ok: true, status: 'DECLINED', data: { declinedAt: now, callAt: null } };
    }
    return cannot(status, action, 'Сайт можно опубликовать («Опубликовать») или снять («Отказ»).');
  }

  if (OPEN.includes(status)) {
    switch (action) {
      case 'agree':
        return site
          ? { ok: true, status: 'AGREED', data: { agreedAt: now, callAt: null } }
          : {
              ok: true,
              status: 'PUBLISHED',
              data: { agreedAt: now, publishedAt: now, callAt: null },
            };
      case 'callback': {
        if (!callAt || Number.isNaN(callAt.getTime())) {
          return { ok: false, error: 'Так отметить нельзя: укажите дату напоминания' };
        }
        if (mskDay(callAt) < mskDay(now)) {
          return {
            ok: false,
            error: 'Так отметить нельзя: дата напоминания уже прошла, выберите сегодня или позже',
          };
        }
        return { ok: true, status: 'CALLBACK', data: { callAt } };
      }
      case 'decline':
        return { ok: true, status: 'DECLINED', data: { declinedAt: now, callAt: null } };
      case 'replied':
        return { ok: true, status, data: { repliedAt: now } };
    }
  }

  if (PUBLIC.includes(status)) {
    if (action === 'decline') {
      return { ok: true, status: 'DECLINED', data: { declinedAt: now } };
    }
    return cannot(status, action, 'Опубликованную страницу можно только снять («Отказ»).');
  }

  if (status === 'DECLINED') {
    if (action === 'agree') {
      return site
        ? { ok: true, status: 'AGREED', data: { agreedAt: now } }
        : { ok: true, status: 'PUBLISHED', data: { agreedAt: now, publishedAt: now } };
    }
    return cannot(status, action, 'После отказа можно только вернуть страницу («Согласился»).');
  }

  // NEW (и AGREED подрядчика) — промежуточные состояния прогона, владелец их не отмечает.
  return cannot(status, action, 'Дождитесь, пока кандидат станет готов к отправке.');
}
