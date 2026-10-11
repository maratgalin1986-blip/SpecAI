'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AdminLogout } from '@/components/AdminLogin';

// The admin's section bar (app/admin/layout.tsx): dark graphite strip, the
// active section underlined in signal orange, the unread badge of the feed.
// Scrolls sideways on a phone instead of wrapping.

const SECTIONS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/admin', label: 'Панель', exact: true },
  { href: '/admin/providers', label: 'Исполнители' },
  { href: '/admin/funnel', label: 'Воронка' },
  { href: '/admin/feed', label: 'Уведомления' },
];

export function AdminNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Разделы админки"
      className="-mx-4 flex items-center gap-1 overflow-x-auto bg-graphite-900 px-4 text-sm text-graphite-200 sm:mx-0 sm:rounded-xl sm:px-2"
    >
      <span className="cab-eyebrow mr-2 hidden whitespace-nowrap py-3 pl-2 text-signal-300 md:inline">
        CRM
      </span>
      {SECTIONS.map((section) => {
        const active = section.exact
          ? pathname === section.href
          : pathname === section.href || pathname.startsWith(`${section.href}/`);
        return (
          <Link
            key={section.href}
            href={section.href}
            aria-current={active ? 'page' : undefined}
            className={`relative flex min-h-[44px] shrink-0 items-center gap-1.5 px-3 font-semibold transition hover:text-white ${
              active ? 'text-white' : ''
            }`}
          >
            {section.label}
            {section.href === '/admin/feed' && unread > 0 && (
              <span
                aria-label={`Непрочитанных: ${unread}`}
                className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-signal-500 px-1.5 py-0.5 font-mono text-[11px] font-bold leading-none text-graphite-950"
              >
                {unread > 99 ? '99+' : unread}
              </span>
            )}
            {active && (
              <span
                aria-hidden
                className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-signal-500"
              />
            )}
          </Link>
        );
      })}
      <span className="ml-auto shrink-0 pl-3 pr-1 [&>button]:text-graphite-300 [&>button:hover]:text-white">
        <AdminLogout />
      </span>
    </nav>
  );
}
