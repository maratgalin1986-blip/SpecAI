import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { InstallPrompt } from '@/components/InstallPrompt';
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
  applicationName: SITE.name,
  keywords: [
    'аренда спецтехники Набережные Челны',
    'аренда экскаватора-погрузчика',
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
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: SITE.name,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
        <Providers>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
          <SiteFooter />
          {/* Multi-agent assistant (works for guests too). The streaming single
              assistant in ChatWidget stays available to API/mobile clients. */}
          <AgentChatWidget />
          <InstallPrompt />
          <YandexMetrika />
        </Providers>
      </body>
    </html>
  );
}
