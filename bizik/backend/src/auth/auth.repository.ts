import { Prisma } from '@prisma/client';

import { encryptField } from '../lib/crypto';
import { prisma } from '../lib/prisma';

/** Data-access layer for the auth bounded context (auth_db). */
export const AuthRepository = {
  // ---- Users ----
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  /** Look up an end-user account by its phone identity (already normalised). */
  findUserByPhone(phone: string) {
    return prisma.user.findUnique({ where: { phone } });
  },

  findUserById(id: string) {
    return prisma.user.findUnique({ where: { id } });
  },

  /** User with their RBAC role loaded (for /auth/me permissions). */
  findUserWithAdminRole(id: string) {
    return prisma.user.findUnique({ where: { id }, include: { adminRole: true } });
  },

  createUser(data: {
    // Phone identifies end users; staff/operators are created email-only, so
    // phone is optional at the repository level.
    phone?: string | null;
    email?: string | null;
    passwordHash: string;
    fullName: string;
    country?: string;
    companyName?: string;
    locale?: string;
    /** When the signup form's Terms + Privacy acceptance was given. */
    termsAcceptedAt?: Date;
    /** Where the signup came from, for abuse triage and traffic insight. */
    signupSource?: string;
    signupIp?: string;
    signupUserAgent?: string;
  }) {
    // Phone-first account - every new user is a base CLIENT (schema default).
    return prisma.user.create({
      data: { ...data, email: data.email ? data.email.toLowerCase() : null },
    });
  },

  updateUser(id: string, data: Prisma.UserUpdateInput) {
    return prisma.user.update({ where: { id }, data });
  },

  // ---- Sessions ----
  createSession(data: { userId: string; ipAddress?: string; userAgent?: string; device?: string; expiresAt: Date }) {
    return prisma.session.create({ data });
  },

  listSessions(userId: string) {
    return prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  findSession(id: string) {
    return prisma.session.findUnique({ where: { id } });
  },

  /** One session, for the device check on refresh. */
  findSessionById(id: string) {
    return prisma.session.findUnique({
      where: { id },
      select: { id: true, userId: true, userAgent: true, ipAddress: true, revokedAt: true },
    });
  },

  revokeSession(id: string) {
    return prisma.session.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  revokeAllSessions(userId: string) {
    return prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  // ---- Refresh tokens ----
  createRefreshToken(data: {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    rotatedFromId?: string;
    /** The sign-in this token belongs to, so one device can be signed out. */
    sessionId?: string | null;
  }) {
    return prisma.refreshToken.create({ data });
  },

  findRefreshTokenByHash(tokenHash: string) {
    return prisma.refreshToken.findUnique({ where: { tokenHash } });
  },

  revokeRefreshToken(id: string) {
    return prisma.refreshToken.update({ where: { id }, data: { revokedAt: new Date() } });
  },

  /** Revoke every refresh token issued for ONE session (one device). */
  revokeRefreshTokensForSession(sessionId: string) {
    return prisma.refreshToken.updateMany({
      where: { sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  revokeAllRefreshTokens(userId: string) {
    return prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  },

  // ---- Login attempts (audit, SRS FR-AUTH-003) ----
  recordLoginAttempt(data: { userId?: string; email: string; ipAddress?: string; successful: boolean }) {
    return prisma.loginAttempt.create({ data });
  },

  // ---- Two-factor (TOTP) ----
  /**
   * Store a TOTP shared secret, encrypted.
   *
   * This was written in plaintext while the schema comment claimed "encrypted
   * at rest" - so anyone with read access to the database could mint a valid
   * second factor for every user who had enabled one, and the documentation
   * said otherwise. A second factor kept in the clear beside the password hash
   * is not a second factor.
   *
   * Reads go through `decryptField`, which passes older plaintext values
   * through unchanged, so existing enrolments keep working and re-encrypt the
   * next time they are written.
   */
  upsertTotpMethod(userId: string, secret: string) {
    const encrypted = encryptField(secret);
    return prisma.twoFactorMethod.upsert({
      where: { userId_method: { userId, method: 'TOTP' } },
      create: { userId, method: 'TOTP', secret: encrypted, verified: false, isPrimary: true },
      update: { secret: encrypted, verified: false },
    });
  },

  findTotpMethod(userId: string) {
    return prisma.twoFactorMethod.findUnique({
      where: { userId_method: { userId, method: 'TOTP' } },
    });
  },

  markTotpVerified(userId: string) {
    return prisma.twoFactorMethod.update({
      where: { userId_method: { userId, method: 'TOTP' } },
      data: { verified: true },
    });
  },

  deleteTwoFactor(userId: string) {
    return prisma.twoFactorMethod.deleteMany({ where: { userId } });
  },

  // ---- Backup codes ----
  replaceBackupCodes(userId: string, hashes: string[]) {
    return prisma.$transaction([
      prisma.backupCode.deleteMany({ where: { userId } }),
      prisma.backupCode.createMany({
        data: hashes.map((codeHash) => ({ userId, codeHash })),
      }),
    ]);
  },

  findUnusedBackupCodes(userId: string) {
    return prisma.backupCode.findMany({ where: { userId, used: false } });
  },

  markBackupCodeUsed(id: string) {
    return prisma.backupCode.update({ where: { id }, data: { used: true, usedAt: new Date() } });
  },

  deleteBackupCodes(userId: string) {
    return prisma.backupCode.deleteMany({ where: { userId } });
  },

  // ---- Password reset ----
  createPasswordReset(data: { userId: string; tokenHash: string; expiresAt: Date }) {
    return prisma.passwordResetToken.create({ data });
  },

  findPasswordReset(tokenHash: string) {
    return prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  },

  markPasswordResetUsed(id: string) {
    return prisma.passwordResetToken.update({ where: { id }, data: { usedAt: new Date() } });
  },
};
