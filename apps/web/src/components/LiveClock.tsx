'use client';

import { useEffect, useState } from 'react';

// Moscow time for the camera HUDs, ticking every second. A component of its
// own so the tick re-renders only these digits, not the whole scene around
// them. Rendered only on the client: the server's time would be stale and
// would not match the first client render (hydration).
//
// One formatter for every tick: toLocaleTimeString with a time zone builds a
// new one each call, which is slow on phones. Same options, same text.
let formatter: Intl.DateTimeFormat | null = null;
const mskTime = (date: Date) =>
  (formatter ??= new Intl.DateTimeFormat('ru-RU', {
    timeZone: 'Europe/Moscow',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  })).format(date);

export function LiveClock({ className }: { className?: string }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () => setTime(mskTime(new Date()));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  if (!time) return null;
  return (
    <span className={className} suppressHydrationWarning>
      {time}
    </span>
  );
}
