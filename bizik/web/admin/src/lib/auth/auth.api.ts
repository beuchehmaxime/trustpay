import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { AuthUser, LoginPayload, LoginResponse } from './types';

/** Auth Service calls (SRS MOD-01). */
export const authApi = {
  async login(payload: LoginPayload) {
    const { data } = await api.post<LoginResponse>(endpoints.auth.login, payload);
    return data;
  },
  /** Complete a 2FA login challenge (FR-AUTH-004). */
  async verifyTwoFactor(challengeId: string, code: string) {
    const { data } = await api.post<LoginResponse>(endpoints.auth.verify2fa, {
      challengeId,
      code,
    });
    return data;
  },
  /** Verify the mandatory staff email OTP (MFA) → returns tokens. */
  async verifyMfa(challengeId: string, code: string) {
    const { data } = await api.post<LoginResponse>(endpoints.auth.verifyMfa, {
      challengeId,
      code,
    });
    return data;
  },
  /** Resend the staff MFA code for an active challenge. */
  async resendMfa(challengeId: string) {
    await api.post(endpoints.auth.resendMfa, { challengeId });
  },
  /** Verify the 4-digit email code emailed at sign-up → returns tokens. */
  async verifyEmailCode(email: string, code: string) {
    const { data } = await api.post<LoginResponse>(endpoints.auth.verifyEmailCode, {
      email,
      code,
    });
    return data;
  },
  async resendCode(email: string) {
    await api.post(endpoints.auth.resendCode, { email });
  },
  async me() {
    const { data } = await api.get<AuthUser>(endpoints.auth.me);
    return data;
  },
  async logout() {
    await api.post(endpoints.auth.logout);
  },
};
