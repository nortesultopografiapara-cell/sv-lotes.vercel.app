import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  productionBrowserSourceMaps: false,
  experimental: {
    middlewareClientMaxBodySize: '55mb',
    serverActions: {
      bodySizeLimit: '55mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname),
  outputFileTracingIncludes: {
    '/api/sign/sale/[token]': [
      './node_modules/@sparticuz/chromium/bin/**',
      './node_modules/@sparticuz/chromium/build/**',
    ],
  },
  serverExternalPackages: ['@sparticuz/chromium', 'puppeteer-core'],
  transpilePackages: ['motion', 'leaflet.gridlayer.googlemutant'],
  env: {
    // Somente NEXT_PUBLIC_* — nunca incluir secrets server-side (evita bake no build).
    NEXT_PUBLIC_BANKING_MODULE_ENABLED:
      process.env.NEXT_PUBLIC_BANKING_MODULE_ENABLED ?? 'false',
    NEXT_PUBLIC_CLIENT_PORTAL_ENABLED:
      process.env.NEXT_PUBLIC_CLIENT_PORTAL_ENABLED ?? 'false',
    NEXT_PUBLIC_MASTER_DASHBOARD_V2_ENABLED:
      process.env.NEXT_PUBLIC_MASTER_DASHBOARD_V2_ENABLED ?? 'false',
  },
  webpack: (config, { dev }) => {
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
