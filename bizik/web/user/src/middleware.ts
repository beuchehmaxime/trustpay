import { NextResponse, type NextRequest } from 'next/server';

/**
 * Language routing for the public marketing site.
 *
 * The marketing pages live under a `[lang]` segment so each language has its
 * own address - `hreflang` cannot mark up two languages sharing one URL, and
 * the SEO brief requires it. English stays unprefixed so every existing link
 * and every URL already in the sitemap keeps working:
 *
 *   /pricing      → rendered by [lang]/pricing with lang=en (internal rewrite,
 *                   the address bar still says /pricing)
 *   /fr/pricing   → rendered by [lang]/pricing with lang=fr
 *   /en/pricing   → redirected to /pricing, so the English page is never
 *                   reachable at two addresses competing as duplicates
 *
 * Everything belonging to the logged-in app, the auth pages, the API and the
 * static assets is left alone - see the matcher at the bottom, which excludes
 * them by name so a marketing rewrite can never swallow an app route.
 */

const DEFAULT_LANG = 'en';
const LANGS = ['en', 'fr'] as const;

/** Paths owned by the app, auth and PWA - never language-prefixed. */
const NON_MARKETING = [
  'activity',
  'dashboard',
  'deals',
  'disputes',
  'profile',
  'settings',
  'support',
  'wallet',
  'login',
  'register',
  'forgot-password',
  'reset-password',
  'offline',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const firstSegment = pathname.split('/')[1] ?? '';

  // Never touch the app's own routes.
  if (NON_MARKETING.includes(firstSegment)) return NextResponse.next();

  // /en/... is a duplicate of the unprefixed English page - send it home.
  if (firstSegment === DEFAULT_LANG) {
    const url = request.nextUrl.clone();
    url.pathname = pathname.slice(DEFAULT_LANG.length + 1) || '/';
    return NextResponse.redirect(url, 308);
  }

  // A real language prefix renders as-is; the header lets the root layout set
  // <html lang> correctly, which it cannot read from the route params itself.
  if ((LANGS as readonly string[]).includes(firstSegment)) {
    const response = NextResponse.next();
    response.headers.set('x-bizik-lang', firstSegment);
    return response;
  }

  // Anything else is English marketing: rewrite it under the segment without
  // changing the address the visitor sees.
  const url = request.nextUrl.clone();
  url.pathname = `/${DEFAULT_LANG}${pathname === '/' ? '' : pathname}`;
  const response = NextResponse.rewrite(url);
  response.headers.set('x-bizik-lang', DEFAULT_LANG);
  return response;
}

export const config = {
  matcher: [
    /*
     * Everything except Next's own internals, the API, and any path with a file
     * extension (images, fonts, the manifest, the service worker). Without the
     * extension guard every asset request would be rewritten under /en.
     */
    '/((?!api|_next/static|_next/image|.*\\.[^/]+$).*)',
  ],
};
