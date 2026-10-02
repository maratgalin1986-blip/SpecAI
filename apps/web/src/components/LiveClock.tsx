'use client';

import { useEffect, useState } from 'react';

// Moscow time for the camera HUDs, ticking every second. A component of its
// own so the tick re-renders only these digits, not the whole scene around
// them. Empty on the server (the time there would be stale anyway).
export function LiveClock({ className }: { className?: string }) {
  const [time, setTime] = useState('');

  useEffect(() => {
    const tick = () =>
      setTime(new Date().toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow' }));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return <span className={className}>{time}</span>;
}
