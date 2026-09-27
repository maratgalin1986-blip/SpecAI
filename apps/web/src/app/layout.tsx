import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { AgentChatWidget } from '@/components/AgentChatWidget';
import { SITE } from '@/lib/site';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
        <Providers>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
          <SiteFooter />
          <AgentChatWidget />
        </Providers>
      </body>
    </html>
  );
}
