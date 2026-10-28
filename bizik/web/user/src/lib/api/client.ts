import axios, {
  AxiosError,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';

import { env } from '@/lib/env';
import { tokenStorage } from '@/lib/auth/storage';
import type { ApiError } from './errors';

/**
 * Central axios instance for all REST calls (SRS COMM-003).
 *
 *  - Attaches the bearer access token to every request.
 *  - Transparently refreshes an expired access token using the refresh token,
 *    queueing concurrent requests while the refresh is in flight.
 *  - Normalises backend errors into a consistent {@link ApiError} shape.
 *
 * Auth side-effects (clearing tokens, redirecting to login) are delegated to a
 * callback the auth layer registers, avoiding a circular dependency between the
 * HTTP client and the auth store.
 */
let onAuthFailure: (() => void) | null = null;

/** Registered by the auth store so the client can force a logout on 401. */
export function setOnAuthFailure(handler: () => void) {
  onAuthFailure = handler;
}

export const api = axios.create({
  baseURL: env.apiUrl,
  timeout: 30_000,
  // `X-Auth-Mode: cookie` asks the API to put the refresh token in an httpOnly
  // cookie instead of the response body; `withCredentials` is what lets the
  // browser store that cookie and send it back to the auth endpoints.
  // `X-Bizik-Client` tells the API which app a signup came from, which is how
  // the console can tell organic traffic from automation.
  headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'cookie', 'X-Bizik-Client': 'web' },
  withCredentials: true,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = tokenStorage.getAccess();
  if (token) {
    config.headers = AxiosHeaders.from(config.headers);
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  return config;
});

// --- Refresh-token handling ------------------------------------------------
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

function flushQueue(token: string | null) {
  pendingQueue.forEach((resolve) => resolve(token));
  pendingQueue = [];
}

/** Exchange the refresh cookie for a new access token (also used on launch). */
export async function refreshAccessToken(): Promise<string | null> {
  try {
    // Bare axios call to avoid recursive interceptors. No body: the refresh
    // token is in the httpOnly cookie, which `withCredentials` sends.
    const { data } = await axios.post(
      `${env.apiUrl}/auth/refresh`,
      {},
      {
        withCredentials: true,
        headers: { 'X-Auth-Mode': 'cookie' },
        // A bare axios call does NOT inherit the instance's timeout, so this
        // had none at all. On a phone resuming from the background the socket
        // is often dead without having been reset, and an untimed request hangs
        // for minutes - with the session still "rehydrating", which holds the
        // whole app behind its loading gate. Shorter than the ordinary request
        // timeout because this one sits in front of the first paint.
        timeout: 12_000,
      },
    );
    tokenStorage.setTokens(data.accessToken);
    return data.accessToken as string;
  } catch {
    return null;
  }
}

/**
 * Public auth endpoints where a 401 means "bad credentials" - NOT an expired
 * session. We must not refresh or force a logout for these, and the real error
 * (e.g. "Invalid email or password") must reach the caller.
 */
const NO_REFRESH_PATHS = [
  '/auth/login',
  '/auth/register',
  '/auth/refresh',
  '/auth/2fa/verify',
  '/auth/verify-email-code',
  '/auth/resend-code',
  '/auth/forgot-password',
  '/auth/reset-password',
];

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    const isAuthEndpoint = NO_REFRESH_PATHS.some((p) => original?.url?.includes(p));

    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !isAuthEndpoint
    ) {
      original._retry = true;

      if (isRefreshing) {
        const token = await new Promise<string | null>((resolve) =>
          pendingQueue.push(resolve),
        );
        if (!token) return Promise.reject(error);
        original.headers = AxiosHeaders.from(original.headers);
        original.headers.set('Authorization', `Bearer ${token}`);
        return api(original);
      }

      isRefreshing = true;
      const newToken = await refreshAccessToken();
      isRefreshing = false;
      flushQueue(newToken);

      if (!newToken) {
        tokenStorage.clear();
        onAuthFailure?.();
        return Promise.reject(error);
      }

      original.headers = AxiosHeaders.from(original.headers);
      original.headers.set('Authorization', `Bearer ${newToken}`);
      return api(original);
    }

    return Promise.reject(error);
  },
);

/**
 * One friendly line for every technical failure the user can't act on -
 * internal/server errors, timeouts, network drops, gateway errors. Business and
 * validation errors (4xx with a real message) keep their specific text.
 */
export const GENERIC_ERROR_MESSAGE = 'We can not carry out this action now. Please try again later.';

/** Convert an axios error into the platform's {@link ApiError} contract. */
export function normaliseError(error: unknown): ApiError {
  const axErr = error as AxiosError<ApiError>;
  const status = axErr.response?.status;
  const data = axErr.response?.data;

  // Client-side errors (4xx) carry a meaningful, user-facing message from the
  // backend - surface it (and the first field-level validation message for 422).
  if (data && typeof status === 'number' && status < 500) {
    const details = (data as { details?: unknown }).details;
    if (Array.isArray(details) && details[0]?.message) {
      return { ...data, message: String(details[0].message) };
    }
    if (data.message) return data;
  }

  // Everything else (5xx, timeouts, network/gateway failures, unknown) is a
  // technical failure - show the single standard message, never raw detail.
  return { code: axErr.code || data?.code || 'ERROR', message: GENERIC_ERROR_MESSAGE };
}

/**
 * How long a rate-limited request asked us to wait, in seconds, or null.
 *
 * Reads the standard `Retry-After` header first and the error body second, so
 * it works for any throttled endpoint rather than only the ones that happen to
 * put the figure in their payload. Used to restart a resend countdown at the
 * real remaining wait instead of letting the button go live again immediately.
 */
export function retryAfterSecondsOf(error: unknown): number | null {
  const axErr = error as AxiosError<{ details?: { retryAfterSeconds?: number } }>;

  const header = axErr.response?.headers?.['retry-after'];
  const fromHeader = Number(header);
  if (Number.isFinite(fromHeader) && fromHeader > 0) return fromHeader;

  const fromBody = axErr.response?.data?.details?.retryAfterSeconds;
  return typeof fromBody === 'number' && fromBody > 0 ? fromBody : null;
}
