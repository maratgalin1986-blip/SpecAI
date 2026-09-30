import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { JetBrains_Mono, Manrope } from 'next/font/google';
import { InstallPrompt } from '@/components/InstallPrompt';
import { TelegramMiniApp } from '@/components/TelegramMiniApp';
import { Providers } from '@/components/Providers';
import { SiteHeader } from '@/components/SiteHeader';
import { SiteFooter } from '@/components/SiteFooter';
import { AgentChatWidget } from '@/components/AgentChatWidget';
import { YandexMetrika } from '@/components/YandexMetrika';
import { MarketingTracker } from '@/components/MarketingTracker';
import { CinemaClicks } from '@/components/CinemaClicks';
import { VtMorph } from '@/components/VtMorph';
import { MessengerButtons } from '@/components/MessengerButtons';
import { CookieNotice } from '@/components/CookieNotice';
import { SITE } from '@/lib/site';
import { siteUrl } from '@/lib/siteUrl';
import './globals.css';

// Cyrillic-capable fonts: Manrope for text and headings, a mono for labels and figures.
const sans = Manrope({ subsets: ['latin', 'cyrillic'], variable: '--font-sans', display: 'swap' });
const mono = JetBrains_Mono({
  subsets: ['latin', 'cyrillic'],
  variable: '--font-mono',
  display: 'swap',
});

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

// Company card for search engines (Yandex/Google knowledge panels).
const ORGANIZATION_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  name: SITE.legalName || SITE.name,
  alternateName: SITE.name,
  description: SITE.description,
  url: siteUrl(),
  telephone: SITE.phone,
  email: SITE.email,
  taxID: SITE.inn || undefined,
  address: {
    '@type': 'PostalAddress',
    addressLocality: SITE.city,
    addressRegion: SITE.region,
    addressCountry: 'RU',
  },
  areaServed: SITE.region,
  // Shown by Yandex and Google in the business card of the search results.
  image: `${siteUrl()}/opengraph-image.png`,
  priceRange: 'от 2 500 ₽/ч',
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    opens: '08:00',
    closes: '20:00',
  },
  sameAs: [SITE.whatsappHref, ...(SITE.telegramBot ? [`https://t.me/${SITE.telegramBot}`] : [])],
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f172a',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" className={`${sans.variable} ${mono.variable}`}>
      <body className="flex min-h-screen flex-col bg-[#f7f7f5] font-sans text-slate-900 antialiased grain">
        {/* Black bars open on every page load, like the start of a scene. */}
        <div className="cine-curtain" aria-hidden />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(ORGANIZATION_JSON_LD) }}
        />
        <Providers>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
          <SiteFooter />
          {/* Multi-agent assistant (works for guests too). The streaming single
              assistant in ChatWidget stays available to API/mobile clients. */}
          <AgentChatWidget />
          <MessengerButtons />
          <InstallPrompt />
          <TelegramMiniApp />
          <CookieNotice />
          <YandexMetrika />
          <MarketingTracker />
          <CinemaClicks />
          <VtMorph />
        </Providers>
      </body>
    </html>
  );
}
