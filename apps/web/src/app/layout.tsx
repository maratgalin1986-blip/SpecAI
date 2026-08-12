import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import { AuthStatus } from '@/components/AuthStatus';
import './globals.css';

export const metadata: Metadata = {
  title: 'SpecAI',
  description: 'AI platform for heavy equipment rental and construction services',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <Providers>
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
              <a href="/" className="text-lg font-semibold text-slate-900">
                SpecAI
              </a>
              <nav className="flex items-center gap-6 text-sm font-medium text-slate-600">
                <a href="/equipment" className="hover:text-slate-900">
                  Equipment
                </a>
                <a href="/recommend" className="hover:text-slate-900">
                  AI recommend
                </a>
                <a href="/dashboard" className="hover:text-slate-900">
                  Dashboard
                </a>
                <AuthStatus />
              </nav>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
