'use client';

import { useEffect, useState } from 'react';

// Moscow time for the camera HUDs, ticking every second. A component of its
// own so the tick re-renders only these digits, not the whole scene around
// them. Rendered only on the client: the server's time would be stale and
// would not match the first client render (hydration).
export function LiveClock({ className }: { className?: string }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' }));
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
