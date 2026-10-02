'use client';

import { useEffect, useState } from 'react';
import { JOURNEY_SELECTOR } from '@/components/useJourneyInView';
import { AuthStatus } from '@/components/AuthStatus';
import { SoundToggle } from '@/components/SoundToggle';
import { SITE } from '@/lib/site';

const NAV_LINKS = [
  { href: '/equipment', label: 'Техника' },
  { href: '/map', label: 'Карта' },
  { href: '/stroyka', label: 'Стройка' },
  { href: '/orders', label: 'Заявка' },
  { href: '/agents', label: 'ИИ-агенты' },
  { href: '/contacts', label: 'Контакты' },
  { href: '/dashboard', label: 'Кабинет' },
];

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Dark translucent variant while the header is over the journey scene.
  const [dark, setDark] = useState(false);
  useEffect(() => {
    let observer: IntersectionObserver | null = null;
    let timer = 0;
    let tries = 0;
    const attach = () => {
      const el = document.querySelector(JOURNEY_SELECTOR);
      if (!el) {
        if (tries++ < 40) timer = window.setTimeout(attach, 250);
        return;
      }
      // Only the strip the header covers counts as the viewport.
      const bottom = Math.max(0, window.innerHeight - 72);
      observer = new IntersectionObserver(
        (entries) => {
          const last = entries[entries.length - 1];
          if (last) setDark(last.isIntersecting);
        },
        { rootMargin: `0px 0px -${bottom}px 0px` },
      );
      observer.observe(el);
    };
    attach();
    // The strip depends on the window height: rebuild it after a rotation.
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        observer?.disconnect();
        observer = null;
        tries = 0;
        attach();
      }, 200);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      observer?.disconnect();
    };
  }, []);

  return (
    <header
      data-dark={dark ? 'true' : undefined}
      className="site-header-vt sticky top-0 z-40 border-b border-slate-200/70 bg-white/75 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6 sm:py-4">
        <a
          href="/"
          className="flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 font-mono text-sm text-slate-950">
            16
          </span>
          {SITE.name}
        </a>

        <nav className="hidden items-center gap-5 text-sm font-medium text-slate-600 lg:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-slate-900">
              {link.label}
            </a>
          ))}
          <a
            href="/smeta"
            className="rounded-full px-3 py-1.5 font-semibold text-amber-700 ring-2 ring-amber-400 transition hover:bg-amber-400 hover:text-slate-950"
          >
            Смета
          </a>
          <AuthStatus />
          <a
            href="/#callback"
            className="group inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-white transition hover:bg-amber-500 hover:text-slate-950"
          >
            Заказать технику
            <span className="transition group-hover:translate-x-0.5">→</span>
          </a>
          <SoundToggle />
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <SoundToggle />
          <a
            href={SITE.phoneHref}
            className="vt-phone rounded-full bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white"
          >
            Позвонить
          </a>
        </div>

        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label={isMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
          aria-expanded={isMenuOpen}
          aria-controls="mobile-nav"
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 lg:hidden"
        >
          {isMenuOpen ? (
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {isMenuOpen && (
        <nav
          id="mobile-nav"
          className="flex flex-col gap-1 border-t border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 lg:hidden"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setIsMenuOpen(false)}
              className="rounded-md px-2 py-2 hover:bg-slate-100 hover:text-slate-900"
            >
              {link.label}
            </a>
          ))}
          <a
            href="/smeta"
            onClick={() => setIsMenuOpen(false)}
            className="rounded-md bg-amber-100 px-2 py-2 font-semibold text-amber-800"
          >
            🧮 Рассчитать смету
          </a>
          <div className="px-2 py-2">
            <AuthStatus />
          </div>
        </nav>
      )}
    </header>
  );
}
