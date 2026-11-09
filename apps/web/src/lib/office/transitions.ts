// Офис агентов: разрешённые переходы статуса кандидата по отметке владельца
// (spec §6, §12; R15). Чистая функция — маршрут PATCH /api/admin/office/prospects/[id]
// только применяет результат к строке Prospect.
//
// READY | CONTACTED | CALLBACK → «Согласился» (сразу PUBLISHED), «Напомнить» (CALLBACK с датой),
// «Отказ» (DECLINED), «Ответил» (только отметка repliedAt);
// PUBLISHED | REGISTERED → только «Отказ» (снять с публикации);
// DECLINED → только «Согласился» (вернуть на публикацию);
// заметка — всегда, статус не меняется.

import type { ProspectStatus } from './types';

export type ProspectAction = 'agree' | 'callback' | 'decline' | 'note' | 'replied';

export const PROSPECT_ACTIONS: readonly ProspectAction[] = [
  'agree',
  'callback',
  'decline',
  'note',
  'replied',
];

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

export function applyAction(
  status: ProspectStatus,
  action: ProspectAction,
  now: Date,
  callAt?: Date | null,
): ActionResult {
  if (action === 'note') return { ok: true, status, data: {} };

  if (OPEN.includes(status)) {
    switch (action) {
      case 'agree':
        return {
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
      return { ok: true, status: 'PUBLISHED', data: { agreedAt: now, publishedAt: now } };
    }
    return cannot(status, action, 'После отказа можно только вернуть страницу («Согласился»).');
  }

  // NEW и AGREED — промежуточные состояния прогона, владелец их не отмечает.
  return cannot(status, action, 'Дождитесь, пока кандидат станет готов к отправке.');
}
