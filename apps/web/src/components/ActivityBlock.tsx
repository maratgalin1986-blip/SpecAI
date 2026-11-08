'use client';

import { useEffect, useState } from 'react';
import type { Activity } from '@/lib/activity';

// «Сейчас на площадке» on the home page: today's real counts and the newest
// anonymous events (GET /api/activity, lib/activity.ts). The page renders
// what it had at build or revalidation time; the browser then asks for the
// fresh minute. Hidden when the platform's numbers are unavailable.

const KIND_ICON: Record<Activity['events'][number]['kind'], string> = {
  order: '📝',
  line: '🟢',
  booking: '✅',
};

export function ActivityBlock({ initial }: { initial: Activity | null }) {
  const [activity, setActivity] = useState<Activity | null>(initial);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/activity')
      .then((response) => (response.ok ? (response.json() as Promise<Activity>) : null))
      .then((fresh) => {
        if (!cancelled && fresh?.summary) setActivity(fresh);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  // Owner, 2026-11-02 (site audit): a quiet day is not news — «новых заявок
  // пока нет» told visitors the platform is empty, so the block shows only
  // when there is something to show.
  if (!activity || activity.events.length === 0) return null;

  return (
    <section
      aria-labelledby="activity-title"
      className="rounded-cab border border-graphite-100 bg-white p-5 shadow-sm sm:p-7"
      data-activity
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="activity-title" className="cab-eyebrow">
          <span className="mr-2 inline-flex h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          Сейчас на площадке
        </h2>
        <p className="text-xs text-graphite-600">
          Обновляется автоматически · без имён и телефонов
        </p>
      </div>
      <p className="mt-3 text-lg font-extrabold tracking-tight sm:text-2xl">{activity.summary}</p>
      <ul className="mt-4 flex flex-col gap-2">
        {activity.events.map((event) => (
          <li
            key={`${event.kind}-${event.at}-${event.text}`}
            className="flex items-start gap-2 text-sm text-graphite-700"
          >
            <span aria-hidden>{KIND_ICON[event.kind]}</span>
            <span className="min-w-0 flex-1">
              {event.text}
              <span className="whitespace-nowrap text-graphite-600"> · {event.ago}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
