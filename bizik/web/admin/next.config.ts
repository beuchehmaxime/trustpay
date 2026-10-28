import type { NextConfig } from "next";

/**
 * Security headers for the admin console. Same reasoning as the user app, with
 * a tighter image policy: the only remote images an operator views are KYC and
 * dispute evidence, fetched from the API. Framing is denied - an operator's
 * session can approve payouts and resolve disputes, so it must never be
 * clickjackable.
 */
const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || 'https://api.bizik.cm/api/v1').origin;
  } catch {
    return 'https://api.bizik.cm';
  }
})();

/** See the user app: connect-src is baked in at build time, so name the real
 *  API explicitly and allow a deployment-provided extra. */
const EXTRA_CONNECT = [
  'https://api.bizik.cm',
  'wss://api.bizik.cm',
  ...(process.env.NODE_ENV === 'production' ? [] : ['http://localhost:*', 'ws://localhost:*']),
  ...(process.env.CSP_CONNECT_EXTRA ?? '').split(/[\s,]+/).filter(Boolean),
];

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  `img-src 'self' data: blob: ${API_ORIGIN} https://res.cloudinary.com`,
  `connect-src 'self' ${API_ORIGIN} ${API_ORIGIN.replace(/^http/, 'ws')} ${EXTRA_CONNECT.join(' ')}`,
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'no-referrer' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()' },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
  // Operator pages show account data; keep them out of shared caches entirely.
  { key: 'Cache-Control', value: 'no-store' },
];

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for a small Docker image.
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
