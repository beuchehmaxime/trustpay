import { create } from 'zustand';

import { setOnAuthFailure, refreshAccessToken } from '@/lib/api/client';
import { authApi } from './auth.api';
import { tokenStorage } from './storage';
import type {
  AuthTokens,
  AuthUser,
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  UpdateProfilePayload,
} from './types';

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
  /** Create an account; a 6-digit code is sent (no session established yet). */
  register: (payload: RegisterPayload) => Promise<LoginResponse>;
  verifyTwoFactor: (challengeId: string, code: string) => Promise<void>;
  /** Verify the 6-digit code → establishes the session. */
  verifyPhoneCode: (phone: string, code: string) => Promise<void>;
  /** Update editable profile fields and persist the new user locally. */
  updateProfile: (payload: UpdateProfilePayload) => Promise<void>;
  /** Re-fetch the current user (e.g. after toggling 2FA). */
  refreshUser: () => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Global auth/session state (SRS FR-AUTH-007). Tokens live in {@link tokenStorage};
 * the in-memory user is rehydrated from `/auth/me` on launch.
 */
/** The in-flight bootstrap, so a resume cannot start a second one. */
let bootstrapInFlight: Promise<void> | null = null;

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
      // One at a time. The app retries this when it is brought back to the
      // foreground, and a second run while the first is still waiting on the
      // network would race it.
      if (bootstrapInFlight) return bootstrapInFlight;

      bootstrapInFlight = (async () => {
        try {
          if (!tokenStorage.hasSession()) {
            // No access token, but this browser has signed in before: the
            // refresh cookie may still be valid, so try to restore rather than
            // bouncing the user to the login screen.
            if (!tokenStorage.mayRestore() || !(await refreshAccessToken())) {
              tokenStorage.clear();
              set({ status: 'unauthenticated', hydrated: true });
              return;
            }
          }
          const user = await authApi.me();
          set({ user, status: 'authenticated', hydrated: true });
        } catch {
          // Whatever went wrong - a dead network, blocked storage - the gate
          // must open. Leaving `hydrated` false holds the entire app behind a
          // spinner with nothing to retry it, which looks like a frozen app.
          tokenStorage.clear();
          set({ user: null, status: 'unauthenticated', hydrated: true });
        } finally {
          bootstrapInFlight = null;
        }
      })();

      return bootstrapInFlight;
    },

    async login(payload) {
      set({ status: 'loading' });
      const res = await authApi.login(payload);
      if (res.tokens) await applySession(res.tokens);
      else set({ status: 'unauthenticated' });
      return res;
    },

    async register(payload) {
      // No session yet - the backend texts a code; the screen verifies it next.
      return authApi.register(payload);
    },

    async verifyTwoFactor(challengeId, code) {
      set({ status: 'loading' });
      const res = await authApi.verifyTwoFactor(challengeId, code);
      if (res.tokens) await applySession(res.tokens);
      else set({ status: 'unauthenticated' });
    },

    async verifyPhoneCode(phone, code) {
      set({ status: 'loading' });
      const res = await authApi.verifyPhoneCode(phone, code);
      if (res.tokens) await applySession(res.tokens);
      else set({ status: 'unauthenticated' });
    },

    async updateProfile(payload) {
      const user = await authApi.updateProfile(payload);
      set({ user });
    },

    async refreshUser() {
      try {
        const user = await authApi.me();
        set({ user });
      } catch {
        // Non-fatal: keep the existing user if the refresh fails.
      }
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
