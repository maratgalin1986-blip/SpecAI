import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

export const metadata: Metadata = {
  title: 'SpecAI',
  description: 'ИИ-платформа для аренды спецтехники и строительных услуг',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <Providers>
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
