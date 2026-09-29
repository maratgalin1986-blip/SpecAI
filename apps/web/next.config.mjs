import { fileURLToPath } from 'node:url';
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
  transpilePackages: ['@specai/ui', '@specai/shared', '@specai/ai-service', '@specai/database'],
  experimental: {
    // Belt and braces for the plugin below: every server function carries the
    // generated Prisma client's engines and schema, even after a cached build.
    outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
    outputFileTracingIncludes: {
      '/**': [
        '../../packages/database/generated/client/*.so.node',
        '../../packages/database/generated/client/schema.prisma',
      ],
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
