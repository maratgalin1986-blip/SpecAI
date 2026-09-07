'use client';

import { useState } from 'react';
import { AuthStatus } from '@/components/AuthStatus';

const NAV_LINKS = [
  { href: '/equipment', label: 'Техника' },
  { href: '/orders', label: 'Заявки' },
  { href: '/recommend', label: 'ИИ-подбор' },
  { href: '/dashboard', label: 'Кабинет' },
  { href: '/provider', label: 'Провайдер' },
];

export function SiteHeader() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <a href="/" className="text-lg font-semibold text-slate-900">
          SpecAI
        </a>

        <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-slate-900">
              {link.label}
            </a>
          ))}
          <AuthStatus />
        </nav>

        <button
          type="button"
          onClick={() => setIsMenuOpen((open) => !open)}
          aria-label="Открыть меню"
          aria-expanded={isMenuOpen}
          className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 md:hidden"
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
        <nav className="flex flex-col gap-1 border-t border-slate-200 px-6 py-3 text-sm font-medium text-slate-600 md:hidden">
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
          <div className="px-2 py-2">
            <AuthStatus />
          </div>
        </nav>
      )}
    </header>
  );
}
