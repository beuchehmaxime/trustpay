import axios, {
  AxiosError,
  AxiosHeaders,
  InternalAxiosRequestConfig,
} from 'axios';

import { env } from '@/lib/env';
import { tokenStorage } from '@/lib/auth/storage';
import { loadingBus } from './loading';
import type { ApiError } from './errors';

// Allow callers to pass `silent: true` in any axios request config to opt out
// of the global blocking overlay for that request.
declare module 'axios' {
  interface AxiosRequestConfig {
    silent?: boolean;
  }
}

/** Per-request config extras: `silent` skips the global blocking overlay. */
type TrackedConfig = InternalAxiosRequestConfig & {
  silent?: boolean;
  _loadingTracked?: boolean;
};

/** Increment the global loading count once per request (unless silent). */
function startLoading(config: TrackedConfig) {
  if (config.silent || config._loadingTracked) return;
  config._loadingTracked = true;
  loadingBus.start();
}

/** Balance a prior startLoading; safe to call at most once per request. */
function finishLoading(config?: TrackedConfig) {
  if (!config?._loadingTracked) return;
  config._loadingTracked = false;
  loadingBus.done();
}

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
  headers: { 'Content-Type': 'application/json', 'X-Auth-Mode': 'cookie' },
  withCredentials: true,
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  startLoading(config);
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
      { withCredentials: true, headers: { 'X-Auth-Mode': 'cookie' } },
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
  '/auth/mfa/verify',
  '/auth/mfa/resend',
  '/auth/verify-email-code',
  '/auth/resend-code',
  '/auth/forgot-password',
  '/auth/reset-password',
];

api.interceptors.response.use(
  (response) => {
    finishLoading(response.config as TrackedConfig);
    return response;
  },
  async (error: AxiosError<ApiError>) => {
    // Settle this request's slot up front; a refresh-retry re-tracks itself.
    finishLoading(error.config as TrackedConfig);
    const original = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };
    const isAuthEndpoint = NO_REFRESH_PATHS.some((path) => original?.url?.includes(path));

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

/** Convert an axios error into the platform's {@link ApiError} contract. */
export function normaliseError(error: unknown): ApiError {
  const axErr = error as AxiosError<ApiError>;
  const data = axErr.response?.data;
  if (data) {
    // Surface the first field-level validation message (Zod 422).
    const details = (data as { details?: unknown }).details;
    if (Array.isArray(details) && details[0]?.message) {
      return { ...data, message: String(details[0].message) };
    }
    return data;
  }
  if (axErr.code === 'ECONNABORTED') {
    return { code: 'TIMEOUT', message: 'The request timed out. Please retry.' };
  }
  return {
    code: 'NETWORK',
    message: 'Network error. Check your connection and try again.',
  };
}
