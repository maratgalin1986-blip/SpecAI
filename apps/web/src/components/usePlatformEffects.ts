'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { isStandalonePage } from '@/components/PublicOnly';
import { offPlatformPage } from '@/lib/clientSiteMarker';

// Фирменные эффекты площадки (кино, звук, заголовок вкладки, подпись при копировании) не
// работают на страницах из офиса (/s/<slug>, /preview/<token>) и на клиентском сайте на своём
// домене — там путь «/», и узнаём его по маркеру `[data-client-site]` (lib/clientSiteMarker.ts).

/** Сейчас страница не площадки — проверка прямо в эффекте (документ уже есть). */
export function isOffPlatformNow(pathname: string | null | undefined): boolean {
  return offPlatformPage(
    isStandalonePage(pathname),
    typeof document === 'undefined' ? null : document,
  );
}

/**
 * Можно ли включать эффекты площадки. До проверки документа (первый рендер, сервер) — false:
 * на клиентском сайте эффекты не успевают даже начать загружаться.
 */
export function usePlatformEffects(): boolean {
  const pathname = usePathname();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    setAllowed(!isOffPlatformNow(pathname));
  }, [pathname]);
  return allowed;
}
