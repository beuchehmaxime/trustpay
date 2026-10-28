import { create } from 'zustand';

import { setOnAuthFailure, refreshAccessToken } from '@/lib/api/client';
import { authApi } from './auth.api';
import { tokenStorage } from './storage';
import type { AuthTokens, AuthUser, LoginPayload, LoginResponse } from './types';

type Status = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: AuthUser | null;
  status: Status;
  /** True once the initial token check has completed (avoids a login flash). */
  hydrated: boolean;

  /** Rehydrate the session from a stored token on app launch. */
  bootstrap: () => Promise<void>;
  /** Returns the raw response so the screen can branch on a 2FA / email challenge. */
  login: (payload: LoginPayload) => Promise<LoginResponse>;
  verifyTwoFactor: (challengeId: string, code: string) => Promise<void>;
  /** Verify the mandatory staff email OTP (MFA) → establishes the session. */
  verifyMfa: (challengeId: string, code: string) => Promise<void>;
  /** Resend the staff MFA code for an active challenge. */
  resendMfa: (challengeId: string) => Promise<void>;
  /** Verify the 4-digit email code → establishes the session. */
  verifyEmailCode: (email: string, code: string) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Global auth/session state (SRS FR-AUTH-007). Tokens live in {@link tokenStorage};
 * the in-memory user is rehydrated from `/auth/me` on launch.
 */
export const useAuthStore = create<AuthState>((set) => {
  async function applySession(tokens: AuthTokens) {
    tokenStorage.setTokens(tokens.accessToken);
    const user = await authApi.me();
    set({ user, status: 'authenticated' });
  }

  return {
    user: null,
    status: 'idle',
    hydrated: false,

    async bootstrap() {
      if (!tokenStorage.hasSession()) {
        // No access token, but this browser has signed in before: the refresh
        // cookie may still be valid, so try to restore rather than bouncing the
        // user to the login screen.
        if (!tokenStorage.mayRestore() || !(await refreshAccessToken())) {
          tokenStorage.clear();
          set({ status: 'unauthenticated', hydrated: true });
          return;
        }
      }
      try {
        const user = await authApi.me();
        set({ user, status: 'authenticated', hydrated: true });
      } catch {
        tokenStorage.clear();
        set({ user: null, status: 'unauthenticated', hydrated: true });
      }
    },

    async login(payload) {
      set({ status: 'loading' });
      const res = await authApi.login(payload);
      if (res.tokens) await applySession(res.tokens);
      else set({ status: 'unauthenticated' });
      return res;
    },

    async verifyTwoFactor(challengeId, code) {
      set({ status: 'loading' });
      const res = await authApi.verifyTwoFactor(challengeId, code);
      if (res.tokens) await applySession(res.tokens);
      else set({ status: 'unauthenticated' });
    },

    async verifyMfa(challengeId, code) {
      set({ status: 'loading' });
      const res = await authApi.verifyMfa(challengeId, code);
      if (res.tokens) await applySession(res.tokens);
      else set({ status: 'unauthenticated' });
    },

    async resendMfa(challengeId) {
      await authApi.resendMfa(challengeId);
    },

    async verifyEmailCode(email, code) {
      set({ status: 'loading' });
      const res = await authApi.verifyEmailCode(email, code);
      if (res.tokens) await applySession(res.tokens);
      else set({ status: 'unauthenticated' });
    },

    async logout() {
      // Best-effort server-side revoke, but never let a slow or failing request
      // block the local sign-out - bound it to 3s, then clear regardless.
      try {
        await Promise.race([
          authApi.logout(),
          new Promise((resolve) => setTimeout(resolve, 3000)),
        ]);
      } catch {
        // ignore - we clear the local session below either way
      }
      tokenStorage.clear();
      set({ user: null, status: 'unauthenticated' });
    },
  };
});

// Let the HTTP client force a logout when refresh fails (401 with a dead token).
setOnAuthFailure(() => {
  tokenStorage.clear();
  useAuthStore.setState({ user: null, status: 'unauthenticated' });
});
