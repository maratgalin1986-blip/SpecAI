'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { CLIENT_PRICE_MAX, formatDayMsk, type PaymentAction } from '@/lib/office/billing';
import { rub } from '@/lib/prices';

// Оплата клиента на /admin/office/clients (S6): «Сайт оплачен», «+1 месяц», «+12 месяцев»,
// «Отменить оплату», цены клиента (пусто — базовая цена пакета) и ссылка на счёт для клиента.
// POST /api/admin/office/prospects/[id]/payment, затем router.refresh(): плитки и статусы
// пересчитывает сервер.

/** '' — по базе (null); иначе целое 0…1 000 000; undefined — ошибка ввода. */
function parsePrice(value: string): number | null | undefined {
  const trimmed = value.replace(/\s+/g, '');
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n <= CLIENT_PRICE_MAX ? n : undefined;
}

const DONE: Record<PaymentAction, string> = {
  setup: 'Сайт оплачен',
  month: 'Продлено на месяц',
  year: 'Продлено на 12 месяцев',
  undo: 'Отметки оплаты сняты',
  prices: 'Цены сохранены',
};

export function OfficeClientControls({
  id,
  name,
  setupPrice,
  monthlyPrice,
  defaults,
  setupPaid,
  hasPaidPeriod,
  invoiceUrl,
}: {
  id: string;
  name: string;
  /** Своя цена клиента, null — по базе. */
  setupPrice: number | null;
  monthlyPrice: number | null;
  /** Цены пакета клиента по настройкам офиса — подсказка в пустых полях. */
  defaults: { setup: number; monthly: number };
  setupPaid: boolean;
  hasPaidPeriod: boolean;
  /** Абсолютная ссылка /oplata/<token>. */
  invoiceUrl: string;
}) {
  const router = useRouter();
  const [setupValue, setSetup] = useState(setupPrice === null ? '' : String(setupPrice));
  const [monthlyValue, setMonthly] = useState(monthlyPrice === null ? '' : String(monthlyPrice));
  const [saved, setSaved] = useState({ setup: setupValue, monthly: monthlyValue });
  const [busy, setBusy] = useState<PaymentAction | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const pricesDirty = setupValue !== saved.setup || monthlyValue !== saved.monthly;

  async function send(action: PaymentAction) {
    if (busy) return;
    if (action === 'undo' && !window.confirm(`Снять отметки оплаты у «${name}»?`)) return;
    const body: Record<string, unknown> = { action };
    if (pricesDirty) {
      const setup = parsePrice(setupValue);
      const monthly = parsePrice(monthlyValue);
      if (setup === undefined || monthly === undefined) {
        setMessage({
          ok: false,
          text: `Цены — целые числа рублей от 0 до ${rub(CLIENT_PRICE_MAX)} или пусто (по базе)`,
        });
        return;
      }
      body.setupPrice = setup;
      body.monthlyPrice = monthly;
    }
    setBusy(action);
    setMessage(null);
    const response = await fetch(`/api/admin/office/prospects/${encodeURIComponent(id)}/payment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as {
      ok?: boolean;
      paidUntil?: string | null;
      error?: string;
    } | null;
    setBusy(null);
    if (!response?.ok || !data?.ok) {
      setMessage({
        ok: false,
        text: typeof data?.error === 'string' ? data.error : 'Не сохранилось — попробуйте ещё раз',
      });
      return;
    }
    if (pricesDirty) setSaved({ setup: setupValue, monthly: monthlyValue });
    const until =
      action !== 'undo' && action !== 'prices' && data.paidUntil
        ? `, оплачено до ${formatDayMsk(new Date(data.paidUntil))}`
        : '';
    setMessage({ ok: true, text: `${DONE[action]}${until}` });
    router.refresh();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(invoiceUrl);
      setMessage({ ok: true, text: 'Ссылка на счёт скопирована' });
    } catch {
      window.prompt('Скопируйте ссылку на счёт', invoiceUrl);
    }
  }

  return (
    <div className="flex w-full flex-col gap-2 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {!setupPaid && (
          <button
            type="button"
            onClick={() => void send('setup')}
            disabled={busy !== null}
            className="rounded-md bg-graphite-900 px-3 py-1.5 text-xs font-bold text-signal-300 disabled:opacity-40"
          >
            {busy === 'setup' ? 'Отмечаю…' : 'Сайт оплачен'}
          </button>
        )}
        <button
          type="button"
          onClick={() => void send('month')}
          disabled={busy !== null}
          className="cab-action disabled:opacity-40"
        >
          {busy === 'month' ? 'Продлеваю…' : '+1 месяц'}
        </button>
        <button
          type="button"
          onClick={() => void send('year')}
          disabled={busy !== null}
          className="cab-action disabled:opacity-40"
        >
          {busy === 'year' ? 'Продлеваю…' : '+12 месяцев'}
        </button>
        {(setupPaid || hasPaidPeriod) && (
          <button
            type="button"
            onClick={() => void send('undo')}
            disabled={busy !== null}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40"
          >
            {busy === 'undo' ? 'Снимаю…' : 'Отменить оплату'}
          </button>
        )}
      </div>

      <form
        className="flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send('prices');
        }}
      >
        <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
          Сайт, ₽
          <input
            inputMode="numeric"
            value={setupValue}
            maxLength={9}
            placeholder={rub(defaults.setup)}
            onChange={(event) => setSetup(event.target.value)}
            className="w-28 rounded-md border border-slate-300 px-2 py-1 font-mono text-sm text-graphite-900"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
          В месяц, ₽
          <input
            inputMode="numeric"
            value={monthlyValue}
            maxLength={9}
            placeholder={rub(defaults.monthly)}
            onChange={(event) => setMonthly(event.target.value)}
            className="w-28 rounded-md border border-slate-300 px-2 py-1 font-mono text-sm text-graphite-900"
          />
        </label>
        <button
          type="submit"
          disabled={busy !== null || !pricesDirty}
          className="cab-action disabled:opacity-40"
        >
          {busy === 'prices' ? 'Сохраняю…' : 'Сохранить цены'}
        </button>
        <span className="text-[11px] text-graphite-500">Пусто — базовая цена</span>
      </form>

      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <a
          href={invoiceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-signal-700 hover:underline"
        >
          Счёт для клиента
        </a>
        <button
          type="button"
          onClick={() => void copy()}
          className="font-semibold text-graphite-700 underline-offset-2 hover:underline"
        >
          Скопировать ссылку
        </button>
        {message && (
          <span className={message.ok ? 'text-emerald-700' : 'text-red-700'}>{message.text}</span>
        )}
      </p>
    </div>
  );
}
