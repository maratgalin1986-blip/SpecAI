'use client';

import { useEffect, useState } from 'react';
import { NEWS_CONSENT_LABEL } from '@/lib/newsConsent';

interface NewsView {
  available: boolean;
  subscribed: boolean;
  emailVerified?: boolean;
}

/** «Заявки рядом за неделю» in «Уведомления»: subscribe or unsubscribe (/api/account/news). */
export function NewsletterSetting() {
  const [view, setView] = useState<NewsView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/news')
      .then((response) => (response.ok ? (response.json() as Promise<NewsView>) : null))
      .then((next) => !cancelled && next && setView(next))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (!view?.available) return null;

  async function toggle(subscribed: boolean) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/account/news', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscribed }),
      });
      const body = (await response.json().catch(() => null)) as
        (NewsView & { error?: string }) | null;
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
          checked={view.subscribed}
          disabled={busy}
          onChange={(event) => void toggle(event.target.checked)}
        />
        <span className="text-sm">{NEWS_CONSENT_LABEL}</span>
      </label>
      <p className="pl-8 text-xs text-slate-500">
        Письмо «Заявки рядом за неделю» на e-mail аккаунта. Только с вашего согласия.
      </p>
      {view.subscribed && view.emailVerified === false && (
        <p className="pl-8 text-xs text-amber-800">
          Письма начнут приходить после подтверждения e-mail — ссылка в письме при регистрации.
        </p>
      )}
      {error && <p className="pl-8 text-sm text-red-700">{error}</p>}
    </div>
  );
}
