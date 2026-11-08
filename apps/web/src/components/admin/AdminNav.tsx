'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AdminLogout } from '@/components/AdminLogin';

// The admin's section bar (app/admin/layout.tsx): dark graphite strip, the
// active section underlined in signal orange, the unread badge of the feed.
// On a phone it scrolls sideways: the active section is brought into view,
// a fade on the right says there is more, and the scrollbar stays hidden.

const SECTIONS: { href: string; label: string; exact?: boolean }[] = [
  { href: '/admin', label: 'Панель', exact: true },
  { href: '/admin/leads', label: 'Звонки' },
  { href: '/admin/search', label: 'Поиск' },
  { href: '/admin/providers', label: 'Исполнители' },
  { href: '/admin/funnel', label: 'Воронка' },
  { href: '/admin/feed', label: 'Уведомления' },
];

export function AdminNav({ unread }: { unread: number }) {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);
  const [moreRight, setMoreRight] = useState(false);
  const [moreLeft, setMoreLeft] = useState(false);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const update = () => {
      setMoreLeft(nav.scrollLeft > 4);
      setMoreRight(nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 4);
    };
    // The active section must be on screen when the page opens.
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (active) {
      const left = active.offsetLeft - 16;
      const right = active.offsetLeft + active.offsetWidth + 16;
      if (left < nav.scrollLeft) nav.scrollLeft = Math.max(0, left);
      else if (right > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = right - nav.clientWidth;
    }
    update();
    nav.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      nav.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [pathname]);

  return (
    <div className="relative -mx-4 sm:mx-0">
      <nav
        ref={navRef}
        aria-label="Разделы админки"
        className="flex items-center gap-1 overflow-x-auto bg-graphite-900 px-4 text-sm text-graphite-200 [-ms-overflow-style:none] [scrollbar-width:none] sm:rounded-xl sm:px-2 [&::-webkit-scrollbar]:hidden"
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
              className={`relative flex min-h-[44px] shrink-0 items-center gap-1.5 whitespace-nowrap px-3 font-semibold transition hover:text-white ${
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
        <span className="ml-auto shrink-0 whitespace-nowrap pl-3 pr-1 [&>button]:text-graphite-300 [&>button:hover]:text-white">
          <AdminLogout />
        </span>
      </nav>
      {/* Fades on the edges: the bar continues past the screen. */}
      {moreLeft && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-graphite-900 to-transparent sm:rounded-l-xl"
        />
      )}
      {moreRight && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex w-10 items-center justify-end bg-gradient-to-l from-graphite-900 via-graphite-900/80 to-transparent pr-1 text-signal-300 sm:rounded-r-xl"
        >
          ›
        </span>
      )}
    </div>
  );
}
