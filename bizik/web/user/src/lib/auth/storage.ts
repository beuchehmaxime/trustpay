/**
 * Token storage for the web session.
 *
 * Only the SHORT-LIVED access token is kept here. The refresh token lives in an
 * httpOnly cookie the browser sends to the auth endpoints and JavaScript cannot
 * read, so an XSS bug can no longer copy out a 90-day credential - the reason
 * this module used to warn about being an XSS surface.
 *
 * Keys are namespaced per app (`bizik.user.*`) so the user and admin apps never
 * share a session even when served from the same origin during local dev.
 */
const PREFIX = 'bizik.user';
const ACCESS_KEY = `${PREFIX}.accessToken`;
/** Written by older builds; removed on sight so it cannot linger in a browser. */
const LEGACY_REFRESH_KEY = `${PREFIX}.refreshToken`;

/**
 * Marks that this browser signed in at some point. It holds no secret - it just
 * tells the app whether it is worth asking the API to restore a session from
 * the refresh cookie, so anonymous visitors never trigger that call.
 */
const SESSION_HINT_KEY = `${PREFIX}.hasSession`;

const isBrowser = typeof window !== 'undefined';

export const tokenStorage = {
  getAccess(): string | null {
    return isBrowser ? window.localStorage.getItem(ACCESS_KEY) : null;
  },
  setTokens(accessToken: string): void {
    if (!isBrowser) return;
    window.localStorage.setItem(ACCESS_KEY, accessToken);
    window.localStorage.setItem(SESSION_HINT_KEY, '1');
    window.localStorage.removeItem(LEGACY_REFRESH_KEY);
  },
  clear(): void {
    if (!isBrowser) return;
    window.localStorage.removeItem(ACCESS_KEY);
    window.localStorage.removeItem(SESSION_HINT_KEY);
    window.localStorage.removeItem(LEGACY_REFRESH_KEY);
  },
  /** Might the refresh cookie still hold a session for this browser? */
  mayRestore(): boolean {
    return isBrowser && window.localStorage.getItem(SESSION_HINT_KEY) === '1';
  },
  hasSession(): boolean {
    return !!this.getAccess();
  },
};
