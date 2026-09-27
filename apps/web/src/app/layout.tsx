import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Providers } from '@/components/Providers';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { AgentChatWidget } from '@/components/AgentChatWidget';
import { YandexMetrika } from '@/components/YandexMetrika';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  keywords: [
    'аренда спецтехники Казань',
    'аренда экскаватора',
    'аренда автокрана',
    'аренда самосвала',
    'спецтехника Татарстан',
    SITE.name,
  ],
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
  },
};

export const viewport: Viewport = { themeColor: '#0f172a' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
        <Providers>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">{children}</main>
          <SiteFooter />
          <AgentChatWidget />
          <YandexMetrika />
        </Providers>
      </body>
    </html>
  );
}
