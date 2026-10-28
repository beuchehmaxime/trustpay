import { z } from 'zod';

import { OTP_CODE_LENGTH } from '../lib/jwt';

/** SRS FR-AUTH-001: 8+ chars with upper, lower, digit, and special character. */
const password = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Must contain an uppercase letter')
  .regex(/[a-z]/, 'Must contain a lowercase letter')
  .regex(/[0-9]/, 'Must contain a digit')
  .regex(/[^A-Za-z0-9]/, 'Must contain a special character');

/** A phone number in E.164-ish form (+ and 7-15 digits after normalisation). */
const phone = z
  .string()
  .min(6)
  .max(24)
  .refine((value) => /^\+?[\d\s\-().]{6,}$/.test(value), 'Enter a valid phone number');

/**
 * Phone-first account: signup needs name, PHONE and password. Email is optional
 * (added later for KYC / under personal info). Country is optional and drives
 * the default language. Anyone can immediately act as a payer (pay, track).
 */
export const registerSchema = z.object({
  /**
   * Honeypot. Hidden from people, irresistible to scripts that fill every
   * field they find. Any value here means the submission is not a person.
   */
  website: z.string().max(200).optional(),
  fullName: z.string().min(2).max(120),
  phone,
  password,
  // Optional - a user may add their email at signup, but it is not required.
  email: z.string().email().optional(),
  country: z.string().min(2).max(60).optional(),
  companyName: z.string().max(120).optional(),
  // Preferred UI language. If omitted, the server derives it from the country.
  locale: z.enum(['en', 'fr']).optional(),
});

/** Verify to unlock freelancer capabilities (create contracts, get paid). */
export const activateFreelancerSchema = z.object({
  country: z.string().min(2).max(60),
  phone,
});

/**
 * Login by PHONE (end users) OR EMAIL (platform staff/operators). Exactly one
 * identifier is required alongside the password.
 */
export const loginSchema = z
  .object({
    phone: phone.optional(),
    email: z.string().email().optional(),
    password: z.string().min(1),
  })
  .refine((input) => !!input.phone || !!input.email, {
    message: 'Enter your phone number',
    path: ['phone'],
  });

export const twoFactorVerifySchema = z.object({
  challengeId: z.string().min(10),
  code: z.string().min(6).max(10),
});

/** Staff email-OTP MFA (admin console) - verify the 6-digit emailed code. */
export const mfaVerifySchema = z.object({
  challengeId: z.string().min(10),
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const mfaResendSchema = z.object({
  challengeId: z.string().min(10),
});

export const refreshSchema = z.object({
  // Optional: browser clients send it in an httpOnly cookie instead, and never
  // have it in JavaScript to put in a body.
  refreshToken: z.string().min(20).optional(),
});

/**
 * A one-time code, exactly as the server generates it.
 *
 * This said four digits while `numericOtp(6)` sent six, so every phone
 * verification and every password reset was rejected by validation before the
 * code was even compared - from any client, and from curl. Deriving the length
 * from one constant is what stops the two halves drifting apart again.
 */
const otpCode = z
  .string()
  // Length and character class are checked separately rather than with one
  // built regex: inside a template literal `\d` collapses to a plain "d", which
  // silently produced /^d{6}$/ and rejected every real code. This form cannot
  // be broken that way, and says which of the two rules failed.
  .length(OTP_CODE_LENGTH, `Enter the ${OTP_CODE_LENGTH}-digit code`)
  .regex(/^\d+$/, 'The code is digits only');

export const verifyPhoneCodeSchema = z.object({
  phone,
  code: otpCode,
});

export const resendCodeSchema = z.object({
  phone,
});

export const forgotPasswordSchema = z.object({
  phone,
});

export const verifyResetOtpSchema = z.object({
  phone,
  code: otpCode,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(10),
  password,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password'),
  newPassword: password,
});

export const enable2faSchema = z.object({
  code: z.string().length(6),
});

export const disable2faSchema = z.object({
  code: z.string().min(6).max(10),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
