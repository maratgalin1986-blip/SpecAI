'use client';

import { useEffect, useState } from 'react';

type Settings = { card: string; cardFormatted: string; recipient: string; enabled: boolean };

/**
 * «Поддержка приложения (донаты)»: the owner's card for voluntary support after
 * a completed order (api/admin/settings/support). Only here and in the app's
 * admin menu; never in code.
 */
export function SupportSettingsForm() {
  const [loaded, setLoaded] = useState(false);
  const [card, setCard] = useState('');
  const [recipient, setRecipient] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (settings: Settings) => {
    setCard(settings.cardFormatted);
    setRecipient(settings.recipient);
    setEnabled(settings.enabled);
  };

  useEffect(() => {
    void fetch('/api/admin/settings/support')
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.support) throw new Error(body?.error);
        apply(body.support as Settings);
        setLoaded(true);
      })
      .catch(() => setMessage({ ok: false, text: 'Не удалось загрузить настройки' }));
  }, []);

  const save = async () => {
    setSaving(true);
    setMessage(null);
    const response = await fetch('/api/admin/settings/support', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ card, recipient, enabled }),
    }).catch(() => null);
    const body = await response?.json().catch(() => null);
    setSaving(false);
    if (!response?.ok || !body?.support) {
      setMessage({
        ok: false,
        text: typeof body?.error === 'string' ? body.error : 'Не удалось сохранить',
      });
      return;
    }
    apply(body.support as Settings);
    setMessage({
      ok: true,
      text: body.support.enabled
        ? 'Сохранено. Предложение поддержать видят после завершённого заказа.'
        : 'Сохранено. Предложение поддержать выключено.',
    });
  };

  return (
    <form
      className="ym-hide-content flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">Номер карты (16–19 цифр)</span>
        <input
          inputMode="numeric"
          autoComplete="off"
          value={card}
          disabled={!loaded}
          onChange={(event) => setCard(event.target.value)}
          placeholder="0000 0000 0000 0000"
          className="rounded-md border border-slate-300 px-3 py-2 font-mono"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-slate-600">
          Получатель, как его показывает банк (например, «Иван И.»)
        </span>
        <input
          value={recipient}
          maxLength={60}
          disabled={!loaded}
          onChange={(event) => setRecipient(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2"
        />
      </label>
      <label className="flex min-h-11 items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          disabled={!loaded}
          onChange={(event) => setEnabled(event.target.checked)}
          className="h-5 w-5"
        />
        Показывать предложение поддержать
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={!loaded || saving}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? 'Сохраняем…' : 'Сохранить'}
        </button>
        {message && (
          <p className={`text-sm ${message.ok ? 'text-emerald-700' : 'text-red-600'}`}>
            {message.text}
          </p>
        )}
      </div>
    </form>
  );
}
