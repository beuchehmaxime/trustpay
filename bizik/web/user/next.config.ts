import withSerwistInit from '@serwist/next';
import type { NextConfig } from 'next';

// Help articles whose URLs still carried the old brand name. Permanent
// redirects keep any indexed or shared link working after the rename.
const RENAMED_HELP_SLUGS = [
  'what-is-qatiqa',
  'what-is-my-qatiqa-handle',
  'can-i-use-qatiqa-entirely-on-whatsapp',
  'what-is-my-qatiqa-wallet',
  'what-does-qatiqa-charge',
  'how-do-i-contact-qatiqa',
];

/**
 * Security headers for every response.
 *
 * The API origin has to be allowed explicitly for fetches and for the realtime
 * socket, so it is derived from the same build-time variable the client uses.
 * `script-src` still needs 'unsafe-inline': Next's hydration bootstrap is an
 * inline script and this app has no nonce plumbing, so the CSP is defence in
 * depth for injected markup rather than a complete script allowlist. Framing is
 * denied outright - the wallet has one-click money actions, and nothing here is
 * meant to be embedded.
 */
const API_ORIGIN = (() => {
  try {
    return new URL(process.env.NEXT_PUBLIC_API_URL || 'https://api.bizik.cm/api/v1').origin;
  } catch {
    return 'https://api.bizik.cm';
  }
})();

const SOCKET_ORIGIN = API_ORIGIN.replace(/^http/, 'ws');

/**
 * Extra origins the browser may talk to. `connect-src` is baked in at build
 * time, so if the API origin the app actually calls at runtime is not listed,
 * every request - including sign-in - is blocked. The production API is named
 * explicitly as a safety net, localhost is allowed outside production builds,
 * and CSP_CONNECT_EXTRA lets a deployment add one without a code change.
 */
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
  // Images may come from our own storage or Cloudinary; images cannot execute.
  "img-src 'self' data: blob: https:",
  `connect-src 'self' ${API_ORIGIN} ${SOCKET_ORIGIN} ${EXTRA_CONNECT.join(' ')}`,
  "manifest-src 'self'",
  "worker-src 'self' blob:",
  'upgrade-insecure-requests',
].join('; ');

const SECURITY_HEADERS = [
  { key: 'Content-Security-Policy', value: CONTENT_SECURITY_POLICY },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // `microphone=(self)` and nothing more.
  //
  // The assistant records voice notes, which trade here arrives as. Everything
  // else stays denied outright, and the microphone is allowed only to this
  // origin - an embedded third-party frame still cannot reach it. Without this
  // the browser refuses before it ever asks the user, with "microphone is not
  // allowed in this document", which looks like a broken feature rather than a
  // policy.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(self), geolocation=(), payment=(), usb=()',
  },
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
];

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle for a small Docker image.
  output: 'standalone',
  // Do not advertise the framework version to attackers scanning for CVEs.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  async redirects() {
    return RENAMED_HELP_SLUGS.flatMap((oldSlug) => {
      const newSlug = oldSlug.replace('qatiqa', 'bizik');
      return [
        { source: `/help-centre/${oldSlug}`, destination: `/help-centre/${newSlug}`, permanent: true },
        { source: `/fr/help-centre/${oldSlug}`, destination: `/fr/help-centre/${newSlug}`, permanent: true },
      ];
    });
  },
};

// PWA service worker (Serwist). Enabled for production builds; disabled in dev
// so frequent rebuilds don't serve a stale precache. The SW is network-first for
// navigations (defaultCache) with skipWaiting + clientsClaim, so a new deploy
// takes over immediately and never serves stale HTML while online.
const withSerwist = withSerwistInit({
  swSrc: 'src/sw.ts',
  swDest: 'public/sw.js',
  disable: process.env.NODE_ENV === 'development',
});

export default withSerwist(nextConfig);
