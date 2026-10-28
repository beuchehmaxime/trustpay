import { defaultCache, PAGES_CACHE_NAME } from '@serwist/next/worker';
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';
import { ExpirationPlugin, NetworkFirst, Serwist } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    // Injected by Serwist at build time - the list of precached assets.
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

/**
 * How long a page navigation may wait for the network before the cache answers.
 *
 * Serwist's defaults put navigations on NetworkFirst with NO network timeout,
 * which is fine on a desktop and wrong on a phone. When an installed PWA is
 * backgrounded the OS freezes it and may tear down its sockets; on resume the
 * navigation request can be issued onto a connection that is dead but sends no
 * reset, so the fetch hangs for as long as the OS TCP timeout - minutes.
 *
 * Nothing paints while that is pending, so the app sits on its splash screen
 * and the only way out is force-quitting it. Capping the wait means a resume
 * that cannot reach the network falls back to the cached shell in a few seconds
 * instead, and the app opens.
 *
 * Four seconds is chosen to be longer than a healthy mobile round trip on a
 * Cameroonian 3G connection, and far shorter than a person's patience.
 */
const NAVIGATION_TIMEOUT_SECONDS = 4;

const pageExpiry = () =>
  new ExpirationPlugin({ maxEntries: 32, maxAgeSeconds: 24 * 60 * 60 });

/**
 * Same strategies Serwist ships, but navigations time out.
 *
 * Order matters: the first matching entry wins, so these sit in front of
 * `defaultCache`. They deliberately reuse Serwist's own cache names, so this
 * replaces those routes rather than building a second, parallel page cache.
 */
const runtimeCaching = [
  // An RSC payload - Next's client-side navigations fetch these.
  {
    matcher: ({ request, url: { pathname }, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
      sameOrigin && !pathname.startsWith('/api/') && request.headers.get('RSC') === '1',
    handler: new NetworkFirst({
      cacheName: PAGES_CACHE_NAME.rsc,
      networkTimeoutSeconds: NAVIGATION_TIMEOUT_SECONDS,
      plugins: [pageExpiry()],
    }),
  },
  // A document request: opening or reloading the app. This is the one that
  // leaves the splash screen up when it hangs.
  {
    matcher: ({ request, url: { pathname }, sameOrigin }: { request: Request; url: URL; sameOrigin: boolean }) =>
      sameOrigin && !pathname.startsWith('/api/') && request.destination === 'document',
    handler: new NetworkFirst({
      cacheName: PAGES_CACHE_NAME.html,
      networkTimeoutSeconds: NAVIGATION_TIMEOUT_SECONDS,
      plugins: [pageExpiry()],
    }),
  },
];

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [...runtimeCaching, ...defaultCache],
  // When a page navigation fails offline, serve the precached offline page.
  fallbacks: {
    entries: [
      {
        url: '/offline',
        matcher({ request }) {
          return request.destination === 'document';
        },
      },
    ],
  },
});

serwist.addEventListeners();
