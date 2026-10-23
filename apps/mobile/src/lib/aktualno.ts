import { apiFetch } from './api';

// «Актуализация» (2026-10-18): раз в неделю площадка сама, от имени
// ИИСтройка24, просит руководителя компании-исполнителя обновить цены и
// свободные дни своей техники (push ведёт сюда: /provider/aktualno). Сервер —
// apps/web/src/lib/aktualno.ts: тексты и правила те же (тест сверяет).

export const PRICE_ASK_LABEL = 'Раз в неделю напоминать обновить цены и свободные дни техники';

// «Спрос рядом» (2026-10-23): раз в сутки, днём, «Сегодня N заявок рядом —
// выйдите на линию» тем же людям (сервер — apps/web/src/lib/demandNudge.ts,
// подпись — apps/web/src/lib/aktualno.ts).
export const DEMAND_NUDGE_LABEL =
  'Спрос рядом — раз в день, если сегодня рядом есть заявки на вашу технику';

export type AvailabilityKind = 'today' | 'tomorrow' | 'busy';

export const AVAILABILITY_LABELS: Record<AvailabilityKind, string> = {
  today: 'Свободна сегодня',
  tomorrow: 'Свободна с завтра',
  busy: 'Занята до…',
};

export type AvailabilityChoice =
  { kind: 'today' } | { kind: 'tomorrow' } | { kind: 'busy'; until: string };

export interface AktualnoMachine {
  id: string;
  name: string;
  categoryName: string;
  status: string;
  hourlyRate: number | null;
  dailyRate: number;
  availability: AvailabilityChoice | null;
  availabilityUpdatedAt: string | null;
}

export interface AktualnoRow {
  id: string;
  hourly: string;
  daily: string;
  kind: AvailabilityKind;
  /** «YYYY-MM-DD» — по какой день включительно занята. */
  until: string;
}

/** «YYYY-MM-DD» дня по Москве (даты занятости — по Москве, как на сайте). */
export function moscowDayKey(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Строки формы из ответа сервера: сохранённые цены и отметка, иначе «Свободна сегодня». */
export function rowsFrom(machines: AktualnoMachine[]): AktualnoRow[] {
  return machines.map((machine) => ({
    id: machine.id,
    hourly: machine.hourlyRate === null ? '' : String(machine.hourlyRate),
    daily: String(machine.dailyRate),
    kind: machine.availability?.kind ?? 'today',
    until: machine.availability?.kind === 'busy' ? machine.availability.until : '',
  }));
}

const digits = (text: string) => text.replace(/\s/g, '');

/** Тело PUT /api/aktualno; проверки цен и дат — на сервере. */
export function saveBody(rows: AktualnoRow[]) {
  return {
    items: rows.map((row) => ({
      id: row.id,
      hourlyRate: digits(row.hourly) === '' ? null : digits(row.hourly),
      dailyRate: digits(row.daily),
      availability:
        row.kind === 'busy' ? { kind: 'busy' as const, until: row.until } : { kind: row.kind },
    })),
  };
}

export function fetchAktualno() {
  return apiFetch<{ machines: AktualnoMachine[] }>('/api/aktualno');
}

export function saveAktualno(rows: AktualnoRow[]) {
  return apiFetch<{ ok: true; message: string }>('/api/aktualno', {
    method: 'PUT',
    body: saveBody(rows),
  });
}

export interface PriceAskSetting {
  /** false — не руководитель компании-исполнителя (или парк СпецПласт16): переключатель не показываем. */
  available: boolean;
  enabled: boolean;
}

export function fetchPriceAsk() {
  return apiFetch<PriceAskSetting>('/api/account/price-ask');
}

export function setPriceAsk(enabled: boolean) {
  return apiFetch<PriceAskSetting>('/api/account/price-ask', {
    method: 'PATCH',
    body: { enabled },
  });
}

export interface DemandNudgeSetting {
  /** false — не руководитель компании-исполнителя (или парк СпецПласт16): переключатель не показываем. */
  available: boolean;
  enabled: boolean;
}

export function fetchDemandNudge() {
  return apiFetch<DemandNudgeSetting>('/api/account/demand-nudge');
}

export function setDemandNudge(enabled: boolean) {
  return apiFetch<DemandNudgeSetting>('/api/account/demand-nudge', {
    method: 'PATCH',
    body: { enabled },
  });
}
