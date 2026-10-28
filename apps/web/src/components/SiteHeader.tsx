'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { JOURNEY_SELECTOR } from '@/components/useJourneyInView';
import { SoundToggle } from '@/components/SoundToggle';
import { ThemeToggle } from '@/components/ThemeToggle';
import { isAdminArea } from '@/components/PublicOnly';
import { SITE } from '@/lib/site';

import { AuthStatus } from '@/components/AuthStatus';

// The marketplace first (owner, 2026-10-11: a board of orders and a list of
// providers, like a classifieds platform), then the rest of the site.
type NavLink = { href: string; label: string; tier: 'core' | 'xl' | 'more' };
// core: always in the desktop line; xl: in the line from 1280 px and under
// «Ещё» below it; more: under «Ещё» on desktop. The mobile menu lists all.
// The line must fit at 1024 px even signed in («Кабинет» + «Выйти»).
const NAV_LINKS: NavLink[] = [
  { href: '/orders', label: 'Заявки', tier: 'core' },
  { href: '/providers', label: 'Исполнители', tier: 'core' },
  { href: '/equipment', label: 'Техника', tier: 'core' },
  { href: '/map', label: 'Карта', tier: 'xl' },
  { href: '/agents', label: 'ИИ-агенты', tier: 'more' },
  { href: '/contacts', label: 'Контакты', tier: 'more' },
];

/** «Ещё ▾»: the desktop links that do not fit in the line at this width. */
function MoreMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (event instanceof KeyboardEvent) {
        if (event.key !== 'Escape') return;
      } else if (el.contains(event.target as Node)) {
        return;
      }
      el.open = false;
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, []);
  return (
    <details ref={ref} className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-1 hover:text-slate-900 [&::-webkit-details-marker]:hidden">
        Ещё <span aria-hidden>▾</span>
      </summary>
      <div className="absolute right-0 top-full z-50 mt-3 flex min-w-44 flex-col rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg">
        {NAV_LINKS.filter((link) => link.tier !== 'core').map((link) => (
          <a
            key={link.href}
            href={link.href}
            className={`rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100 hover:text-slate-900 ${
              link.tier === 'xl' ? 'xl:hidden' : ''
            }`}
          >
            {link.label}
          </a>
        ))}
      </div>
    </details>
  );
}

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  // Dark translucent variant while the header is over the journey scene.
  const [dark, setDark] = useState(false);
  const pathname = usePathname();
  const headerRef = useRef<HTMLElement>(null);
  // /stroyka is a full-screen layer over the page: the header and footer
  // behind it must not take keyboard focus (or be read out) while it is open.
  const behindStroyka = !!pathname?.startsWith('/stroyka');
  // The CRM (/admin/*) has its own section bar: the public menu, the call
  // button and the sound switch stay off; the logo leads back to the site.
  const adminArea = isAdminArea(pathname);
  useEffect(() => {
    const chrome = [headerRef.current, document.querySelector('[data-site-footer]')];
    chrome.forEach((el) => el?.toggleAttribute('inert', behindStroyka));
    return () => chrome.forEach((el) => el?.removeAttribute('inert'));
  }, [behindStroyka]);
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
      ref={headerRef}
      data-dark={dark ? 'true' : undefined}
      className="site-header-vt sticky top-0 z-40 border-b border-slate-200/70 bg-white/75 backdrop-blur-md"
    >
      <div
        className={`mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 ${
          adminArea ? 'py-3 sm:py-4' : 'py-2 sm:py-3'
        }`}
      >
        {/* The logo and, under it, the promise (owner, 2026-10-17: «бесплатно
            и без посредников» always in view but quiet). The two lines take
            the height the 44 px buttons already give the row, so the header
            is as tall as before; the pill leads to the explanation. Both
            links reach into the row's padding (::after), so each is a
            comfortable tap target without growing the header. */}
        <div className="flex shrink-0 flex-col items-start">
          <a
            href="/"
            className={`relative flex shrink-0 items-center gap-2 text-lg font-extrabold tracking-tight text-slate-900 ${
              adminArea
                ? 'min-h-11'
                : "min-h-8 after:absolute after:inset-x-0 after:-top-2 after:bottom-0 after:content-['']"
            }`}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 font-mono text-sm text-slate-950">
              ИИ
            </span>
            <span className="flex flex-col leading-none">
              {SITE.platform}
              <span className="mt-0.5 text-[0.65rem] font-semibold tracking-normal text-amber-700">
                от {SITE.name}
              </span>
            </span>
          </a>
          {!adminArea && (
            <a
              href={SITE.promiseHref}
              title={SITE.promiseDetail}
              data-promise-pill
              className="promise-pill relative mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[0.65rem] font-semibold leading-none after:absolute after:inset-x-0 after:-bottom-2 after:-top-1 after:content-['']"
            >
              <span aria-hidden>✓</span>
              {SITE.promiseShort}
            </a>
          )}
        </div>

        {adminArea && (
          <a
            href="/"
            className="ml-auto inline-flex min-h-11 items-center text-sm font-medium text-slate-600 hover:text-slate-900"
          >
            На сайт →
          </a>
        )}

        {!adminArea && (
          <nav
            aria-label="Основное меню"
            className="hidden items-center gap-3 whitespace-nowrap text-sm font-medium text-slate-600 lg:flex xl:gap-5"
          >
            {NAV_LINKS.filter((link) => link.tier !== 'more').map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`hover:text-slate-900 ${link.tier === 'xl' ? 'hidden xl:inline' : ''}`}
              >
                {link.label}
              </a>
            ))}
            <MoreMenu />
            <AuthStatus />
            <a
              href="/#callback"
              className="group inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2 text-white transition hover:bg-amber-500 hover:text-slate-950"
            >
              Заказать технику
              <span className="transition group-hover:translate-x-0.5">→</span>
            </a>
            <SoundToggle iconOnly large />
            <ThemeToggle />
          </nav>
        )}

        {!adminArea && (
          <div className="ml-auto flex items-center gap-2 lg:hidden">
            <SoundToggle iconOnPhone large />
            <a
              href={SITE.phoneHref}
              aria-label="Позвонить"
              className="vt-phone inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-slate-900 px-3 text-sm font-semibold text-white"
            >
              {/* The smallest phones (360 px): the icon, so the menu button stays on screen. */}
              <span className="max-[379px]:hidden">Позвонить</span>
              <span aria-hidden className="min-[380px]:hidden">
                📞
              </span>
            </a>
          </div>
        )}

        {!adminArea && (
          <button
            type="button"
            onClick={() => setIsMenuOpen((open) => !open)}
            aria-label={isMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
            aria-expanded={isMenuOpen}
            aria-controls="mobile-nav"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 lg:hidden"
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
        )}
      </div>

      {!adminArea && isMenuOpen && (
        <nav
          id="mobile-nav"
          aria-label="Меню"
          className="flex flex-col gap-1 border-t border-slate-200 px-4 py-3 text-sm font-medium text-slate-600 lg:hidden"
        >
          {NAV_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setIsMenuOpen(false)}
              className="flex min-h-11 items-center rounded-md px-2 hover:bg-slate-100 hover:text-slate-900"
            >
              {link.label}
            </a>
          ))}
          <ThemeToggle withLabel />
          <div className="px-2 py-2">
            <AuthStatus />
          </div>
        </nav>
      )}
    </header>
  );
}
