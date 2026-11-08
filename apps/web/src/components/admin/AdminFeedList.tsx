'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AdminTag } from '@/components/admin/AdminUi';
import { feedMoment, type FeedEvent } from '@/lib/adminFeed';

// /admin/feed: the list of events with «Прочитано» per row and «Отметить всё
// прочитанным» at the top. Both POST /api/admin/feed/read and refresh the
// server data (the list and the badge in the nav).

async function markRead(body: { keys: string[] } | { all: true }): Promise<string | null> {
  try {
    const response = await fetch('/api/admin/feed/read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (response.ok) return null;
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? 'Не удалось сохранить';
  } catch {
    return 'Нет связи';
  }
}

export function MarkAllReadButton({ count }: { count: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (count === 0) return null;
  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(await markRead({ all: true }));
          setBusy(false);
          router.refresh();
        }}
        className="cab-ghost !min-h-[36px] !px-3.5 !text-xs"
      >
        Отметить всё прочитанным
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}

export function AdminFeedList({
  events,
  readKeys,
  now,
}: {
  events: FeedEvent[];
  readKeys: string[];
  /** ISO moment the page rendered, for «сегодня / вчера». */
  now: string;
}) {
  const router = useRouter();
  const read = new Set(readKeys);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadedAt = new Date(now);

  if (events.length === 0) {
    return <p className="cab-card text-sm text-graphite-500">Здесь пока пусто.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
      <ul className="divide-y divide-graphite-100 overflow-hidden rounded-xl border border-graphite-100 bg-white">
        {events.map((event) => {
          const isRead = read.has(event.key);
          return (
            <li
              key={event.key}
              className={`flex gap-3 px-3 py-2.5 text-sm ${isRead ? 'bg-white' : 'bg-signal-50/40'}`}
            >
              <span
                aria-hidden
                className={`mt-2 h-2 w-2 shrink-0 rounded-full ${
                  isRead ? 'bg-transparent' : 'bg-signal-500'
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <AdminTag tone={event.tone}>{event.tag}</AdminTag>
                  <a
                    href={event.href}
                    className={`break-words font-semibold hover:text-signal-700 ${
                      isRead ? 'text-graphite-700' : 'text-graphite-950'
                    }`}
                  >
                    {event.title}
                  </a>
                </div>
                {event.text && (
                  <p className="mt-0.5 break-words text-xs text-graphite-600">{event.text}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <time
                  dateTime={event.at}
                  className="whitespace-nowrap font-mono text-[11px] tabular-nums text-graphite-500"
                >
                  {feedMoment(event.at, loadedAt)}
                </time>
                {!isRead && (
                  <button
                    type="button"
                    disabled={pending === event.key}
                    onClick={async () => {
                      setPending(event.key);
                      setError(await markRead({ keys: [event.key] }));
                      setPending(null);
                      router.refresh();
                    }}
                    className="text-[11px] font-semibold text-graphite-500 hover:text-graphite-900 disabled:opacity-50"
                  >
                    Прочитано
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
