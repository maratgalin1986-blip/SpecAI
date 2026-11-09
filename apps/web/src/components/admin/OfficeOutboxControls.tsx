'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AdminTag, chipClass } from '@/components/admin/AdminUi';
import { pluralizeRu } from '@/lib/pluralize';

// «Письма дня» на /admin/office/pisma (К2): владелец читает каждое письмо — кому, тема,
// вступление, пункты, — снимает галочку «не отправлять» с лишних и нажимает «Отправить N
// писем» → POST /api/admin/office/outreach { send: true, ids, exclude }. Уходят только
// показанные письма без снятых. Здесь же переключатель режима (PUT /api/admin/office/settings).

/** Одно письмо дня, как его передаёт страница (OutboxItem из lib/office/outreachRun.ts). */
export interface OutboxItemView {
  id: string;
  type: 'first' | 'followUp';
  kind: 'site' | 'provider';
  name: string;
  city: string | null;
  email: string | null;
  whatsapp: boolean;
  subject: string;
  opener: string;
  bullets: string[];
}

type Mode = 'approve' | 'auto';

const LETTER_FORMS: [string, string, string] = ['письмо', 'письма', 'писем'];

interface SendAnswer {
  ok?: boolean;
  error?: string;
  email?: number;
  whatsapp?: number;
  followUps?: number;
  errors?: number;
  optedOut?: number;
  noSmtp?: boolean;
}

function answerText(data: SendAnswer): string {
  const parts = [
    `писем — ${data.email ?? 0}`,
    `напоминаний — ${data.followUps ?? 0}`,
    `WhatsApp — ${data.whatsapp ?? 0}`,
  ];
  let text = `Отправлено: ${parts.join(', ')}.`;
  if (data.errors) text += ` Не ушло: ${data.errors} (причина — в карточке кандидата).`;
  if (data.optedOut) text += ` Сняты с рассылки по отписке: ${data.optedOut}.`;
  if (data.noSmtp) text += ' Ящик для писем не настроен — письма не ушли.';
  return text;
}

export function OfficeOutboxControls({
  items,
  mode,
  canSend,
}: {
  items: OutboxItemView[];
  mode: Mode;
  /** false — рассылка на паузе или ящик не настроен: кнопка неактивна. */
  canSend: boolean;
}) {
  const router = useRouter();
  const [excluded, setExcluded] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [currentMode, setCurrentMode] = useState<Mode>(mode);

  const chosen = items.filter((item) => !excluded.has(item.id)).length;

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function send() {
    if (busy || chosen === 0) return;
    setBusy(true);
    setMessage(null);
    const response = await fetch('/api/admin/office/outreach', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        send: true,
        ids: items.map((item) => item.id),
        exclude: [...excluded],
      }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as SendAnswer | null;
    setBusy(false);
    if (!response?.ok || !data?.ok) {
      setMessage({
        ok: false,
        text: typeof data?.error === 'string' ? data.error : 'Не получилось — попробуйте ещё раз',
      });
      return;
    }
    setMessage({ ok: true, text: answerText(data) });
    setExcluded(new Set());
    router.refresh();
  }

  async function saveMode(next: Mode) {
    if (busy || next === currentMode) return;
    if (
      next === 'auto' &&
      !window.confirm(
        'Письма будут уходить по расписанию без вашего просмотра. Закон «О рекламе» (ч. 2 ст. 18) запрещает рассылку без участия человека. Включить?',
      )
    ) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const response = await fetch('/api/admin/office/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ outreachMode: next }),
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as SendAnswer | null;
    setBusy(false);
    if (!response?.ok || !data?.ok) {
      setMessage({
        ok: false,
        text: typeof data?.error === 'string' ? data.error : 'Не сохранилось — попробуйте ещё раз',
      });
      return;
    }
    setCurrentMode(next);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-graphite-600">Режим:</span>
        <button
          type="button"
          className={chipClass(currentMode === 'approve')}
          disabled={busy}
          onClick={() => void saveMode('approve')}
        >
          С утверждением
        </button>
        <button
          type="button"
          className={chipClass(currentMode === 'auto')}
          disabled={busy}
          onClick={() => void saveMode('auto')}
        >
          Сам по расписанию
        </button>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-graphite-600">
          На сегодня писем нет: все, кому можно написать, уже получили письмо, или дневной лимит
          исчерпан.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => {
            const off = excluded.has(item.id);
            return (
              <li
                key={item.id}
                className={`rounded-xl border bg-white p-4 text-sm ${
                  off ? 'border-graphite-200 opacity-60' : 'border-graphite-300'
                }`}
              >
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-graphite-950">{item.name}</span>
                  {item.city && <span className="text-graphite-600">· {item.city}</span>}
                  <AdminTag tone={item.type === 'followUp' ? 'warn' : 'quiet'}>
                    {item.type === 'followUp' ? 'Напоминание' : 'Первое письмо'}
                  </AdminTag>
                  <AdminTag tone="quiet">
                    {item.kind === 'provider' ? 'Подрядчик' : 'Сайт'}
                  </AdminTag>
                  {item.whatsapp && <AdminTag tone="green">+ WhatsApp</AdminTag>}
                </div>
                <p className="mt-1 break-all text-xs text-graphite-600">
                  Кому: {item.email ?? 'только WhatsApp'}
                </p>
                <p className="mt-2 font-semibold text-graphite-900">{item.subject}</p>
                <p className="mt-1 text-graphite-800">{item.opener}</p>
                {item.bullets.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-graphite-800">
                    {item.bullets.map((bullet, i) => (
                      <li key={i}>{bullet}</li>
                    ))}
                  </ul>
                )}
                <label className="mt-3 flex items-center gap-2 text-xs text-graphite-700">
                  <input
                    type="checkbox"
                    checked={off}
                    onChange={() => toggle(item.id)}
                    disabled={busy}
                  />
                  Не отправлять
                </label>
              </li>
            );
          })}
        </ul>
      )}

      {items.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className="cab-action disabled:opacity-40"
            disabled={busy || !canSend || chosen === 0}
            onClick={() => void send()}
          >
            {busy ? 'Отправляю…' : `Отправить ${pluralizeRu(chosen, LETTER_FORMS)}`}
          </button>
          {excluded.size > 0 && (
            <span className="text-xs text-graphite-600">Не отправлять: {excluded.size}</span>
          )}
        </div>
      )}

      {message && (
        <p
          role={message.ok ? 'status' : 'alert'}
          className={`text-sm ${message.ok ? 'text-green-800' : 'text-red-700'}`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
