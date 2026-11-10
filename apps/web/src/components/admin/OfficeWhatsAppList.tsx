'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AdminTag } from '@/components/admin/AdminUi';

// Очередь «WhatsApp вручную» (/admin/office/whatsapp): «Открыть WhatsApp» открывает чат с
// готовым текстом (wa.me), владелец нажимает «Отправить» в самом WhatsApp и возвращается
// отметить «Отправил» → POST /api/admin/office/prospects/[id]/whatsapp-sent.

export interface WhatsAppItemView {
  id: string;
  kind: 'site' | 'provider';
  name: string;
  city: string | null;
  phone: string;
  waUrl: string;
  text: string;
  link: string;
}

export function OfficeWhatsAppList({
  items,
  emptyNotes = [],
}: {
  items: WhatsAppItemView[];
  /** Почему очередь пуста (считает сервер); нет — общий текст. */
  emptyNotes?: string[];
}) {
  const router = useRouter();
  const [opened, setOpened] = useState<Set<string>>(() => new Set());
  const [done, setDone] = useState<Set<string>>(() => new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ id: string; text: string } | null>(null);

  async function mark(id: string) {
    if (busy) return;
    setBusy(id);
    setError(null);
    const response = await fetch(`/api/admin/office/prospects/${id}/whatsapp-sent`, {
      method: 'POST',
    }).catch(() => null);
    const data = (await response?.json().catch(() => null)) as { error?: string } | null;
    setBusy(null);
    if (!response?.ok) {
      setError({
        id,
        text: typeof data?.error === 'string' ? data.error : 'Не сохранилось — попробуйте ещё раз',
      });
      return;
    }
    setDone((prev) => new Set(prev).add(id));
    router.refresh();
  }

  const visible = items.filter((item) => !done.has(item.id));
  if (visible.length === 0) {
    if (emptyNotes.length > 0) {
      return (
        <div className="flex flex-col gap-2 text-sm text-graphite-600">
          {emptyNotes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      );
    }
    return (
      <p className="text-sm text-graphite-600">
        На сегодня очередь пуста: всем, у кого в карточке есть WhatsApp, уже написали, или дневной
        лимит исчерпан.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {visible.map((item) => (
        <li key={item.id} className="rounded-xl border border-graphite-300 bg-white p-4 text-sm">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-graphite-950">{item.name}</span>
            {item.city && <span className="text-graphite-600">· {item.city}</span>}
            <AdminTag tone="quiet">{item.kind === 'provider' ? 'Подрядчик' : 'Сайт'}</AdminTag>
            <span className="text-xs text-graphite-600">{item.phone}</span>
          </div>
          <p className="mt-2 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-graphite-800">
            {item.text}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href={item.waUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpened((prev) => new Set(prev).add(item.id))}
              className="rounded-md bg-green-700 px-3 py-2 text-xs font-bold text-white"
            >
              Открыть WhatsApp
            </a>
            <a href={item.link} target="_blank" rel="noopener noreferrer" className="cab-action">
              Что увидит компания
            </a>
            <button
              type="button"
              onClick={() => void mark(item.id)}
              disabled={busy !== null || !opened.has(item.id)}
              className="cab-action disabled:opacity-40"
            >
              {busy === item.id ? 'Отмечаю…' : 'Отправил'}
            </button>
            {error?.id === item.id && (
              <span role="alert" className="text-xs text-red-700">
                {error.text}
              </span>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
