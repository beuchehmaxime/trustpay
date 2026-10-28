import { Request, Response } from 'express';

import { config } from '../config/env';

/**
 * The refresh token as an httpOnly cookie, for browser clients.
 *
 * Why: a browser that keeps a 90-day refresh token in `localStorage` hands it
 * to any script that runs on the origin. One XSS and the attacker holds a
 * renewable session on an escrow product. A cookie the page cannot read closes
 * that: script can still *use* the session while the tab is open, but it cannot
 * copy a long-lived credential out.
 *
 * Why opt-in rather than always: React Native has no dependable cookie jar, so
 * the mobile app must keep receiving the token in the JSON body. Clients ask
 * for cookie mode with `X-Auth-Mode: cookie`; everyone else is unaffected.
 */
export const REFRESH_COOKIE = 'bizik_rt';

/** Only the auth endpoints ever need it, so it is not sent with anything else. */
const COOKIE_PATH = '/api/v1/auth';

/** Does this client want the refresh token in a cookie instead of the body? */
export function wantsCookieAuth(req: Request): boolean {
  return String(req.header('x-auth-mode') ?? '').toLowerCase() === 'cookie';
}

function cookieOptions() {
  // `secure` breaks plain-http local development, where the cookie would simply
  // never be stored; production is https so it is always set there.
  const isHttps = config.appUrl.startsWith('https://');
  return {
    httpOnly: true,
    secure: isHttps,
    // The apps and the API share a registrable domain (bizik.cm and
    // api.bizik.cm), so these requests are same-site and Lax is enough.
    sameSite: 'lax' as const,
    path: COOKIE_PATH,
    maxAge: config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000,
  };
}

/** Put the refresh token in the cookie and keep it out of the response body. */
export function setRefreshCookie(res: Response, refreshToken: string): void {
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
}

export function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: undefined });
}

/** The refresh token this request carries: cookie first, then the body. */
export function readRefreshToken(req: Request, bodyToken?: string): string | undefined {
  const cookies = (req as Request & { cookies?: Record<string, string> }).cookies;
  return cookies?.[REFRESH_COOKIE] || bodyToken || undefined;
}

/**
 * Shape a token-issuing response for the client that asked for it. In cookie
 * mode the refresh token is set as a cookie and stripped from the body, so it
 * never reaches JavaScript at all.
 */
export function respondWithSession<T extends object>(req: Request, res: Response, result: T): object {
  const tokens = (result as { tokens?: { accessToken: string; refreshToken: string } }).tokens;
  // Login can also answer "MFA required" or "verify your phone" - those carry
  // no tokens and pass through untouched.
  if (!tokens?.refreshToken || !wantsCookieAuth(req)) return result;
  setRefreshCookie(res, tokens.refreshToken);
  return { ...result, tokens: { accessToken: tokens.accessToken } };
}
