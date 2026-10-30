import type { NextConfig } from 'next';

const isDev = process.env.NODE_ENV !== 'production';

// Production: static export served by the API process (same origin, see docs/ARCHITECTURE.md).
// Development: `next dev` proxies /api to the local API on port 3001.
const config: NextConfig = {
  ...(isDev
    ? { rewrites: async () => [{ source: '/api/:path*', destination: 'http://127.0.0.1:3001/api/:path*' }] }
    : { output: 'export' as const }),
  trailingSlash: true,
  images: { unoptimized: true },
  poweredByHeader: false,
  reactStrictMode: true,
};

export default config;
