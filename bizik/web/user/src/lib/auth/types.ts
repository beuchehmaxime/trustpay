/** Auth/session domain types. Mirrors the backend `toAuthUser` shape. */

/** Roles are lowercased by the backend serialiser. */
export type UserRole =
  | 'client'
  | 'freelancer'
  | 'admin'
  | 'compliance'
  | 'super_admin';

/** KYC tiers (SRS FR-KYC-001). */
export type KycTier = 0 | 1 | 2 | 3;

export interface AuthUser {
  id: string;
  /** Phone is the account identity; email is optional. */
  phone?: string | null;
  email?: string | null;
  fullName: string;
  role: UserRole | string;
  country?: string | null;
  locale?: string;
  companyName?: string | null;
  kycTier: KycTier;
  /**
   * Server-side view of the verification gate: whether this account clears the
   * platform's "verified" bar, and whether creating a deal requires clearing it.
   * Both are operator settings, so screens read these instead of comparing
   * `kycTier` against a hardcoded number. Optional because an older cached
   * session predates them - absent means "do not gate".
   */
  verified?: boolean;
  dealsRequireKyc?: boolean;
  /** Unified account: true once verified to create contracts / act as a freelancer. */
  freelancerEnabled: boolean;
  twoFactorEnabled: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
}

/**
 * Patch sent to PATCH /user/me - all fields optional. Phone is the login
 * identity but can be changed here; email can be added/changed.
 */
export interface UpdateProfilePayload {
  fullName?: string;
  phone?: string;
  email?: string;
  country?: string;
  companyName?: string;
  locale?: 'en' | 'fr';
}

export interface AuthTokens {
  accessToken: string;
  /**
   * Not sent to browser clients any more: the refresh token is in an httpOnly
   * cookie. Kept optional so an older API response still type-checks.
   */
  refreshToken?: string;
}

/**
 * The backend may respond with tokens, a 2FA challenge (FR-AUTH-004), or a
 * phone-verification requirement (a 6-digit code was sent) instead of tokens.
 */
export interface LoginResponse {
  user?: AuthUser;
  tokens?: AuthTokens;
  twoFactorRequired?: boolean;
  challengeId?: string;
  verificationRequired?: boolean;
  phone?: string;
  /**
   * Whether a code actually went out with this response. False when the number
   * is still inside its cooldown - the user must still verify, but no new
   * message is coming, so the screen must not promise one.
   */
  codeSent?: boolean;
  /** Seconds until another code may be requested. Drives the resend countdown. */
  retryAfterSeconds?: number;
}

export interface LoginPayload {
  phone: string;
  password: string;
}

/** Sign-up payload. The backend sends a 6-digit code (no session yet). */
export interface RegisterPayload {
  fullName: string;
  phone: string;
  password: string;
  email?: string;
  country?: string;
  /**
   * Honeypot. The form renders a field no person can see or tab into, so a real
   * signup always leaves this empty and a script that fills every input it finds
   * gives itself away. The backend decides what to do about it.
   */
  website?: string;
}
