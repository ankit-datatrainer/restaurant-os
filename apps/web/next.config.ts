import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@restaurant-os/shared'],
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'images.unsplash.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: '*.supabase.in' },
    ],
  },
  async rewrites() {
    // Lets the browser call the Express API through the same origin in dev:
    // fetch('/api/public/...') → http://localhost:4000/api/public/...
    const api = (process.env.API_PROXY_TARGET ?? 'http://localhost:4000').replace(/\/$/, '');
    return [{ source: '/api/:path*', destination: `${api}/api/:path*` }];
  },
};

export default nextConfig;
