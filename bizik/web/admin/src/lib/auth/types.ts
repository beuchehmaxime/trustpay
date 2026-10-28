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
  email: string;
  fullName: string;
  role: UserRole | string;
  country?: string | null;
  phone?: string | null;
  locale?: string;
  companyName?: string | null;
  kycTier: KycTier;
  /** Unified account: true once verified to create contracts / act as a freelancer. */
  freelancerEnabled: boolean;
  twoFactorEnabled: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  // ---- RBAC (platform operators) ----
  /** True when the account has admin-console access (an assigned role). */
  isOperator?: boolean;
  isSuperAdmin?: boolean;
  adminRole?: { id: string; name: string } | null;
  /** Effective permission keys; `['*']` for a super admin. */
  permissions?: string[];
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
 * The backend may respond with tokens, a 2FA challenge (FR-AUTH-004), or an
 * email-verification requirement (a 4-digit code was emailed) instead of tokens.
 */
export interface LoginResponse {
  user?: AuthUser;
  tokens?: AuthTokens;
  twoFactorRequired?: boolean;
  /** Mandatory emailed OTP for platform staff (admin/compliance/mediator). */
  mfaRequired?: boolean;
  challengeId?: string;
  emailVerificationRequired?: boolean;
  /** Masked email the challenge code was sent to (e.g. "ad****@bizik.cm"). */
  email?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}
