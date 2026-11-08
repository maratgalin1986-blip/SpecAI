import type { MetadataRoute } from 'next';
import { SITE } from '@/lib/site';

// The site as an app on the home screen («Установить», components/InstallPrompt.tsx).
// `name` is shown in the browser's install dialog, `short_name` under the icon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: `${SITE.platform} от ${SITE.name}`,
    short_name: SITE.platform,
    description: SITE.description,
    lang: 'ru',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // The page background (app/layout.tsx), so the launch screen does not flash.
    background_color: '#f7f7f5',
    theme_color: '#0f172a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
