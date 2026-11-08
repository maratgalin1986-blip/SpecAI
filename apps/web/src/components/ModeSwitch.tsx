'use client';

import { useEffect } from 'react';
import {
  CUSTOMER_MODE_HREF,
  PROVIDER_MODE_HREF,
  modeCookie,
  type CabinetMode,
} from '@/lib/cabinetMode';

function remember(mode: CabinetMode) {
  try {
    document.cookie = modeCookie(mode);
  } catch {
    // Cookies blocked: the switch still works through ?mode= in the links.
  }
}

/**
 * «Заказчик ⇄ Исполнитель» for a provider company's admin. Opening a mode
 * remembers it, so the header's «Кабинет» leads back to the last one.
 */
export function ModeSwitch({
  current,
  customerHref = CUSTOMER_MODE_HREF,
  providerHref = PROVIDER_MODE_HREF,
}: {
  current: CabinetMode;
  customerHref?: string;
  providerHref?: string;
}) {
  useEffect(() => remember(current), [current]);

  const options: { mode: CabinetMode; label: string; href: string }[] = [
    { mode: 'customer', label: 'Заказчик', href: customerHref },
    { mode: 'provider', label: 'Исполнитель', href: providerHref },
  ];
  return (
    <nav
      aria-label="Режим: заказчик или исполнитель"
      className="inline-flex w-fit items-center gap-1 rounded-full border border-graphite-200 bg-white p-1 text-sm font-semibold"
    >
      {options.map((option, index) => (
        <span key={option.mode} className="flex items-center gap-1">
          {index > 0 && (
            <span aria-hidden className="text-graphite-400">
              ⇄
            </span>
          )}
          <a
            href={option.href}
            onClick={() => remember(option.mode)}
            aria-current={option.mode === current ? 'page' : undefined}
            className={`inline-flex min-h-11 items-center rounded-full px-4 ${
              option.mode === current
                ? 'bg-graphite-950 text-white'
                : 'text-graphite-700 hover:bg-graphite-100'
            }`}
          >
            {option.label}
          </a>
        </span>
      ))}
    </nav>
  );
}
