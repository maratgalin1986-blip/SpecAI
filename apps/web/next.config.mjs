import { randomUUID } from 'node:crypto';
import withSerwistInit from '@serwist/next';

// New revision on every build so the precached offline page is refreshed.
const revision = randomUUID();

const withSerwist = withSerwistInit({
  swSrc: 'src/app/sw.ts',
  swDest: 'public/sw.js',
  // The offline fallback page must be precached; Next pages are not in the manifest by default.
  additionalPrecacheEntries: [{ url: '/~offline', revision }],
  cacheOnNavigation: false,
  reloadOnOnline: true,
  // The service worker is only built/registered for production bundles.
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@specai/ui', '@specai/shared', '@specai/ai-service', '@specai/database'],
};

export default withSerwist(nextConfig);
