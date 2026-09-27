/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { CacheFirst, ExpirationPlugin, NetworkFirst, NetworkOnly, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_URL = '/~offline';

/** Pages that depend on the session must never be served from cache. */
const PRIVATE_PATHS = [
  '/dashboard',
  '/orders',
  '/provider',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
];

const isPrivatePath = (pathname: string) =>
  PRIVATE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

const serwist = new Serwist({
  // App shell: Next.js static build output + everything in /public (icons, offline page assets).
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Never cache API routes (including /api/auth/**).
    {
      matcher: ({ sameOrigin, url: { pathname } }) => sameOrigin && pathname.startsWith('/api/'),
      handler: new NetworkOnly(),
    },
    // Authenticated / session-dependent pages: always network, including RSC payloads.
    {
      matcher: ({ sameOrigin, url: { pathname } }) => sameOrigin && isPrivatePath(pathname),
      handler: new NetworkOnly(),
    },
    // App icons.
    {
      matcher: ({ sameOrigin, url: { pathname } }) => sameOrigin && pathname.startsWith('/icons/'),
      handler: new CacheFirst({
        cacheName: 'specai-icons',
        plugins: [new ExpirationPlugin({ maxEntries: 16, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // Hashed Next.js static assets (JS/CSS/fonts/media) are immutable.
    {
      matcher: ({ sameOrigin, url: { pathname } }) =>
        sameOrigin && pathname.startsWith('/_next/static/'),
      handler: new CacheFirst({
        cacheName: 'specai-next-static',
        plugins: [new ExpirationPlugin({ maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // Optimized images.
    {
      matcher: ({ sameOrigin, url: { pathname } }) =>
        sameOrigin && pathname.startsWith('/_next/image'),
      handler: new CacheFirst({
        cacheName: 'specai-next-image',
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 })],
      }),
    },
    // Other same-origin static files (favicon, fonts, images in /public).
    {
      matcher: ({ sameOrigin, url: { pathname } }) =>
        sameOrigin && /\.(?:png|jpg|jpeg|gif|svg|webp|ico|woff2?|ttf|otf)$/i.test(pathname),
      handler: new CacheFirst({
        cacheName: 'specai-static',
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    // Public pages (HTML + RSC): network first, short-lived cache so they open offline.
    {
      matcher: ({ request, sameOrigin, url: { pathname } }) =>
        sameOrigin &&
        !pathname.startsWith('/api/') &&
        !isPrivatePath(pathname) &&
        (request.mode === 'navigate' || request.headers.get('RSC') === '1'),
      handler: new NetworkFirst({
        cacheName: 'specai-pages',
        networkTimeoutSeconds: 10,
        plugins: [new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 })],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: OFFLINE_URL,
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
});

serwist.addEventListeners();
