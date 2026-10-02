import { randomUUID } from 'node:crypto';
import withSerwistInit from '@serwist/next';
import { PrismaPlugin } from '@prisma/nextjs-monorepo-workaround-plugin';

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
  // Media in /public rarely changes: a week in the browser and CDN cache makes
  // repeat visits from ads fast. Rename a file when replacing it.
  async headers() {
    const media = [
      { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=86400' },
    ];
    return [
      { source: '/video/:path*', headers: media },
      { source: '/images/:path*', headers: media },
      { source: '/audio/:path*', headers: media },
    ];
  },
  transpilePackages: ['@specai/ui', '@specai/shared', '@specai/ai-service', '@specai/database'],
  experimental: {
    // Belt and braces for the Prisma engine: ship it in every server function
    // at its own path, where packages/database/src/connection.ts
    // (locateQueryEngine) finds it even if the plugin below did not copy it —
    // which happened on a Vercel build that reused the build cache.
    outputFileTracingIncludes: {
      '/**': ['../../packages/database/generated/client/libquery_engine-*'],
    },
  },
  webpack(config, { isServer }) {
    // The Prisma client lives in packages/database and is bundled into the
    // server chunks, so its query engine (.so.node) and schema would be left
    // behind on Vercel ("could not locate the Query Engine"). The plugin copies
    // them next to the chunks.
    if (isServer) config.plugins = [...config.plugins, new PrismaPlugin()];
    return config;
  },
};

export default withSerwist(nextConfig);
