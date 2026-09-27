import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ChatWidget } from '@/components/ChatWidget';
import { InstallPrompt } from '@/components/InstallPrompt';
import { Providers } from '@/components/Providers';
import { SiteHeader } from '@/components/SiteHeader';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'SpecAI — аренда спецтехники',
    template: '%s — SpecAI',
  },
  description:
    'Аренда экскаваторов, кранов, погрузчиков и другой спецтехники с ИИ-подбором под задачу. Заявки, предложения поставщиков, бронирование и оплата онлайн.',
  applicationName: 'SpecAI',
  keywords: ['аренда спецтехники', 'экскаватор', 'кран', 'погрузчик', 'ИИ-подбор техники'],
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'SpecAI',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
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
      <body className="min-h-screen bg-slate-50 text-slate-900">
        <Providers>
          <SiteHeader />
          <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
          <ChatWidget />
          <InstallPrompt />
        </Providers>
      </body>
    </html>
  );
}
