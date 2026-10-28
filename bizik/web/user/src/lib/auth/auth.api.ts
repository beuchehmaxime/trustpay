import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  AuthUser,
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  UpdateProfilePayload,
} from './types';

/** An active refresh-token session (device/browser) for this account. */
export interface SessionInfo {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
}

export interface TwoFactorSetup {
  secret: string;
  otpauthUrl: string;
}

/** Auth Service calls (SRS MOD-01). */
export const authApi = {
  async login(payload: LoginPayload) {
    const { data } = await api.post<LoginResponse>(endpoints.auth.login, payload);
    return data;
  },
  /** Create an account. Returns { verificationRequired, phone }. */
  async register(payload: RegisterPayload) {
    const { data } = await api.post<LoginResponse>(endpoints.auth.register, payload);
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
  /** Verify the 6-digit code sent at sign-up → returns tokens. */
  async verifyPhoneCode(phone: string, code: string) {
    const { data } = await api.post<LoginResponse>(endpoints.auth.verifyPhone, {
      phone,
      code,
    });
    return data;
  },
  /**
   * Ask for another verification code.
   *
   * Throws a 429 carrying `retryAfterSeconds` when it is too soon - the caller
   * is expected to surface that rather than swallow it, which is what left
   * people watching for a code nobody had sent.
   */
  async resendCode(phone: string) {
    const { data } = await api.post<{ success: boolean; sent: boolean; retryAfterSeconds: number }>(
      endpoints.auth.resendCode,
      { phone },
    );
    return data;
  },
  async me() {
    const { data } = await api.get<AuthUser>(endpoints.auth.me);
    return data;
  },
  async logout() {
    await api.post(endpoints.auth.logout);
  },
  /** Update editable profile fields (PATCH /user/me). Returns the new user. */
  async updateProfile(payload: UpdateProfilePayload) {
    const { data } = await api.patch<AuthUser>(endpoints.user.me, payload);
    return data;
  },
  async changePassword(currentPassword: string, newPassword: string) {
    await api.post(endpoints.auth.changePassword, { currentPassword, newPassword });
  },
  /**
   * Request a password reset code. Phone-based (matches mobile). Always resolves
   * so the caller can't probe which numbers have accounts.
   */
  async forgotPassword(phone: string) {
    // Always succeeds, whether or not the number has an account - that is the
    // point. `retryAfterSeconds` is when another code may be asked for, and it
    // reads the same either way, so it leaks nothing.
    const { data } = await api.post<{ success: boolean; retryAfterSeconds?: number }>(
      endpoints.auth.forgotPassword,
      { phone },
    );
    return data;
  },
  /** Verify the 6-digit reset code for a phone → returns a one-time reset token. */
  async verifyResetOtp(phone: string, code: string) {
    const { data } = await api.post<{ token: string }>(endpoints.auth.resetPasswordVerify, {
      phone,
      code,
    });
    return data;
  },
  /** Complete a reset with the texted token + a new password. */
  async resetPassword(token: string, password: string) {
    await api.post(endpoints.auth.resetPassword, { token, password });
  },
  async listSessions() {
    const { data } = await api.get<SessionInfo[]>(endpoints.auth.sessions);
    return data;
  },
  async revokeSession(id: string) {
    await api.delete(endpoints.auth.session(id));
  },
  async setupTwoFactor() {
    const { data } = await api.post<TwoFactorSetup>(endpoints.auth.twoFactorSetup);
    return data;
  },
  /** Confirm a 6-digit TOTP code → returns backup codes. */
  async enableTwoFactor(code: string) {
    const { data } = await api.post<{ backupCodes: string[] }>(
      endpoints.auth.twoFactorEnable,
      { code },
    );
    return data;
  },
  async disableTwoFactor(code: string) {
    await api.post(endpoints.auth.twoFactorDisable, { code });
  },
};
