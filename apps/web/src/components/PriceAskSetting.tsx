'use client';

import { useEffect, useState } from 'react';
import { AKTUALNO_PATH, PRICE_ASK_LABEL } from '@/lib/aktualno';

interface PriceAskView {
  available: boolean;
  enabled: boolean;
}

/**
 * «Актуализация» in «Уведомления»: the weekly «обновите цены и свободные дни»
 * on or off (/api/account/price-ask). Shown only to provider managers.
 */
export function PriceAskSetting() {
  const [view, setView] = useState<PriceAskView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/price-ask')
      .then((response) => (response.ok ? (response.json() as Promise<PriceAskView>) : null))
      .then((next) => !cancelled && next && setView(next))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!view?.available) return null;

  async function toggle(enabled: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/account/price-ask', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const body = (await response.json().catch(() => null)) as
        (PriceAskView & { error?: string }) | null;
      if (!response.ok || !body) {
        throw new Error(typeof body?.error === 'string' ? body.error : 'Не удалось сохранить');
      }
      setView(body);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Не удалось сохранить');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-1 border-t border-slate-100 pt-3">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 accent-amber-600"
          checked={view.enabled}
          disabled={busy}
          onChange={(event) => void toggle(event.target.checked)}
        />
        <span className="text-sm">{PRICE_ASK_LABEL}</span>
      </label>
      <p className="pl-8 text-xs text-slate-500">
        По понедельникам утром, по выбранным выше каналам. Обновить можно в любой момент:{' '}
        <a href={AKTUALNO_PATH} className="font-semibold text-signal-700 underline">
          цены и свободные дни
        </a>
        .
      </p>
      {error && <p className="pl-8 text-sm text-red-700">{error}</p>}
    </div>
  );
}
