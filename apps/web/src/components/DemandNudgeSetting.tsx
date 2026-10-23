'use client';

import { useEffect, useState } from 'react';
import { DEMAND_NUDGE_LABEL } from '@/lib/aktualno';

interface DemandNudgeView {
  available: boolean;
  enabled: boolean;
}

/**
 * «Спрос рядом» in «Уведомления»: the daily «Сегодня N заявок рядом — выйдите
 * на линию» on or off (/api/account/demand-nudge). Shown only to provider
 * managers.
 */
export function DemandNudgeSetting() {
  const [view, setView] = useState<DemandNudgeView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/demand-nudge')
      .then((response) => (response.ok ? (response.json() as Promise<DemandNudgeView>) : null))
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
      const response = await fetch('/api/account/demand-nudge', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const body = (await response.json().catch(() => null)) as
        (DemandNudgeView & { error?: string }) | null;
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
        <span className="text-sm">{DEMAND_NUDGE_LABEL}</span>
      </label>
      <p className="pl-8 text-xs text-slate-500">
        Раз в день, днём по вашему времени — в приложение и Telegram, если они включены выше. Если
        вы уже на линии, сообщения не будет.
      </p>
      {error && <p className="pl-8 text-sm text-red-700">{error}</p>}
    </div>
  );
}
