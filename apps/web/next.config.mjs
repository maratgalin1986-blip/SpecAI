/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@specai/ui', '@specai/shared', '@specai/ai-service', '@specai/database'],
};

export default nextConfig;
