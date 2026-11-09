'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

// Отметка результата по кандидату на /admin/office (R15): заметка, «Согласился» (публикует),
// «Ответил», «Напомнить» (дата, по умолчанию завтра по Москве), «Отказ»; у опубликованного —
// «Снять», у отказавшегося — «Вернуть». PATCH /api/admin/office/prospects/[id], затем
// router.refresh(), чтобы серверные списки перестроились.

type Action = 'agree' | 'callback' | 'decline' | 'note' | 'replied';

/** Московская дата YYYY-MM-DD через `days` дней от сейчас. */
function mskDay(days: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Moscow',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + days * 86_400_000));
}

export function OfficeProspectControls({
  id,
  variant,
  note,
}: {
  id: string;
  /** open — кандидат в работе; published — на странице; declined — отказ. */
  variant: 'open' | 'published' | 'declined';
  note: string | null;
}) {
  const router = useRouter();
  const [noteValue, setNote] = useState(note ?? '');
  const [savedNote, setSavedNote] = useState(note ?? '');
  const [callDay, setCallDay] = useState(() => mskDay(1));
  const [busy, setBusy] = useState<Action | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function send(action: Action) {
    if (busy) return;
    setBusy(action);
    setMessage(null);
    const body: Record<string, unknown> = { action };
    if (action === 'callback') body.callAt = callDay;
    if (action === 'note' || noteValue !== savedNote) body.note = noteValue;
    const response = await fetch(`/api/admin/office/prospects/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string } | null;
    setBusy(null);
    if (!response?.ok) {
      setMessage({
        ok: false,
        text: typeof data?.error === 'string' ? data.error : 'Не сохранилось — попробуйте ещё раз',
      });
      return;
    }
    setSavedNote(noteValue);
    setMessage({ ok: true, text: action === 'note' ? 'Заметка сохранена' : 'Отмечено' });
    if (action !== 'note') router.refresh();
  }

  const noteDirty = noteValue !== savedNote;

  return (
    <div className="flex w-full flex-col gap-2 text-sm">
      {variant === 'open' && (
        <label className="flex flex-col gap-0.5 text-xs text-graphite-600">
          Заметка
          <div className="flex flex-wrap items-start gap-2">
            <textarea
              value={noteValue}
              maxLength={1000}
              rows={2}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Что ответили, о чём договорились"
              className="min-w-[14rem] flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm text-graphite-900"
            />
            <button
              type="button"
              onClick={() => void send('note')}
              disabled={!noteDirty || busy !== null}
              className="cab-action disabled:opacity-40"
            >
              {busy === 'note' ? 'Сохраняю…' : 'Сохранить'}
            </button>
          </div>
        </label>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {variant === 'open' && (
          <>
            <button
              type="button"
              onClick={() => void send('agree')}
              disabled={busy !== null}
              className="rounded-md bg-graphite-900 px-3 py-1.5 text-xs font-bold text-signal-300 disabled:opacity-40"
            >
              {busy === 'agree' ? 'Публикую…' : 'Согласился'}
            </button>
            <button
              type="button"
              onClick={() => void send('replied')}
              disabled={busy !== null}
              className="cab-action disabled:opacity-40"
            >
              Ответил
            </button>
            <span className="inline-flex items-center gap-1">
              <input
                type="date"
                value={callDay}
                min={mskDay(0)}
                onChange={(event) => setCallDay(event.target.value)}
                aria-label="Дата напоминания"
                className="rounded-md border border-slate-300 px-2 py-1 text-xs text-graphite-900"
              />
              <button
                type="button"
                onClick={() => void send('callback')}
                disabled={busy !== null || !callDay}
                className="cab-action disabled:opacity-40"
              >
                Напомнить
              </button>
            </span>
            <button
              type="button"
              onClick={() => void send('decline')}
              disabled={busy !== null}
              className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40"
            >
              Отказ
            </button>
          </>
        )}
        {variant === 'published' && (
          <button
            type="button"
            onClick={() => void send('decline')}
            disabled={busy !== null}
            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-semibold text-red-700 disabled:opacity-40"
          >
            {busy === 'decline' ? 'Снимаю…' : 'Снять'}
          </button>
        )}
        {variant === 'declined' && (
          <button
            type="button"
            onClick={() => void send('agree')}
            disabled={busy !== null}
            className="cab-action disabled:opacity-40"
          >
            {busy === 'agree' ? 'Возвращаю…' : 'Вернуть'}
          </button>
        )}
        {message && (
          <span className={`text-xs ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>
            {message.text}
          </span>
        )}
      </div>
    </div>
  );
}
