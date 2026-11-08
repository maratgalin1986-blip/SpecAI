'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

// «На линии / Не на линии» for the provider cabinet. A personal working mode,
// kept in this browser only (no database field): on the line the incoming
// orders feed refreshes every minute; off the line it stays as loaded.

const KEY = 'sp16_provider_online';

function readOnline(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== '0';
  } catch {
    return true;
  }
}

export function OnlineToggle() {
  const router = useRouter();
  const [online, setOnline] = useState(true);
  useEffect(() => setOnline(readOnline()), []);

  // On the line: refresh the server-rendered feed every minute. router.refresh
  // keeps what is typed in the forms on the page.
  useEffect(() => {
    if (!online) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [online, router]);

  function toggle() {
    const next = !online;
    setOnline(next);
    try {
      window.localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      // Private mode: the switch still works for this visit.
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={online}
      onClick={toggle}
      className={`flex min-h-[56px] w-full items-center justify-between gap-3 rounded-full p-1.5 pl-5 text-left transition sm:w-auto sm:min-w-[260px] ${
        online ? 'bg-signal-500 text-graphite-950' : 'bg-graphite-700 text-graphite-100'
      }`}
    >
      <span className="flex flex-col leading-tight">
        <span className="text-base font-extrabold">{online ? 'На линии' : 'Не на линии'}</span>
        <span className="text-xs font-medium opacity-80">
          {online ? 'Лента заявок обновляется каждую минуту' : 'Нажмите, чтобы выйти на линию'}
        </span>
      </span>
      <span
        aria-hidden
        className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-black ${
          online ? 'bg-graphite-950 text-signal-400' : 'bg-graphite-500 text-graphite-200'
        }`}
      >
        {online ? '●' : '○'}
      </span>
    </button>
  );
}
