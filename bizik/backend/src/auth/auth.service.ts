import { timingSafeEqual } from 'crypto';

import { AdminRole, User } from '@prisma/client';

import { config } from '../config/env';
import { recordAudit } from '../lib/audit';
import { decryptField } from '../lib/crypto';
import { localeForCountry } from '../lib/domain';
import { BASIC_TIER, isVerifiedTier, tierAfterEarning } from '../lib/kyc-gate';
import { enabledMarketNames, isPhoneInEnabledMarket, systemSettings } from '../lib/system-settings';
import { accountBlockedReason, canAccountAct } from '../lib/account-status';
import { AppError } from '../lib/errors';
import {
  claimCodeSend,
  clearCodeCooldown,
  codeCooldownError,
  type CodeSendClaim,
} from '../lib/code-cooldown';
import {
  generateRefreshToken,
  hashToken,
  numericOtp,
  randomToken,
  signAccessToken,
} from '../lib/jwt';
import { sendSms } from '../lib/notify';
import { normalizePhone } from '../lib/phone';
import { maskNumber } from '../lib/sms-providers/types';
import { hashPassword, verifyPassword } from '../lib/password';
import { enqueueEmail } from '../lib/queue';
import { redis } from '../lib/redis';
import { provisionUserWallets } from '../lib/seed';
import { generateTotpSecret, totpUri, verifyTotp } from '../lib/totp';
import { revokeBeforeKey, revokedSessionKey } from '../middleware/auth.middleware';
import { logDevCode } from '../lib/dev-code-log';
import { sendVerificationCode } from '../lib/verification-code';
import { UsernameService } from '../user/username.service';
import { AuthRepository } from './auth.repository';
import { LoginInput, RegisterInput } from './auth.validation';
import { captureError } from '../lib/observability';
import { deviceChanged, deviceFingerprint } from './device-binding';

interface ReqCtx {
  ip?: string;
  userAgent?: string;
  /** Which client this came from: "web" | "mobile" | "whatsapp". */
  client?: string;
}

// ---- Redis key helpers (keyed by the login identifier - phone or email) ----
const failKey = (identifier: string) => `auth:fail:${identifier}`;
const lockKey = (identifier: string) => `auth:lock:${identifier}`;
const phoneCodeKey = (phone: string) => `auth:phone-code:${phone}`;
const phoneCodeAttemptsKey = (phone: string) => `auth:phone-code-att:${phone}`;
const pwResetKey = (phone: string) => `auth:pw-reset:${phone}`;
const pwResetAttemptsKey = (phone: string) => `auth:pw-reset-att:${phone}`;
const challengeKey = (id: string) => `auth:2fa:${id}`;
const mfaKey = (id: string) => `auth:mfa:${id}`;
const mfaAttemptsKey = (id: string) => `auth:mfa-att:${id}`;

/** Platform staff who must complete an emailed OTP (MFA) on every sign-in. */
const STAFF_ROLES = new Set<string>(['ADMIN', 'COMPLIANCE', 'MEDIATOR']);

/** Mask an email for display in a challenge response (e.g. "ad****@bizik.cm"). */
function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  return `${user.slice(0, 2)}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

/**
 * Serialise a DB user into the public shape consumed by the clients. When the
 * user's RBAC role is provided (platform operators), the effective permissions
 * are included so the admin console can gate its UI.
 */
export function toAuthUser(u: User, adminRole?: AdminRole | null) {
  const role = adminRole ?? null;
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role.toLowerCase(),
    country: u.country,
    phone: u.phone,
    locale: u.locale,
    companyName: u.companyName,
    kycTier: u.kycTier,
    /**
     * Whether this tier clears the platform's "verified" bar, and whether deals
     * require clearing it. Both are settings an operator can change, so the
     * clients read them from here rather than hardcoding `kycTier >= 2` - a gate
     * screen that disagrees with the API either blocks people the server would
     * accept, or lets them fill in a whole deal before a 403.
     */
    verified: isVerifiedTier(u.kycTier),
    dealsRequireKyc: systemSettings().general.kycRequiredForContracts,
    /** Unified account: true once verified to create contracts / freelance. */
    freelancerEnabled: u.freelancerEnabled,
    twoFactorEnabled: u.twoFactorEnabled,
    emailVerified: u.emailVerified,
    phoneVerified: u.phoneVerified,
    // ---- RBAC (platform operators) ----
    /** True when the account has admin-console access (an assigned role). */
    isOperator: !!role,
    isSuperAdmin: role?.isSuperAdmin ?? false,
    adminRole: role ? { id: role.id, name: role.name } : null,
    /** Effective permission keys; `['*']` for a super admin. */
    permissions: role ? (role.isSuperAdmin ? ['*'] : role.permissions) : [],
  };
}

/** Create a tracked session + access/refresh token pair for a user. */
async function issueSession(user: User, ctx: ReqCtx) {
  const accessExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  const session = await AuthRepository.createSession({
    userId: user.id,
    ipAddress: ctx.ip,
    userAgent: ctx.userAgent,
    expiresAt: accessExpiresAt,
  });
  // Both tokens carry the session, so "sign out this device" can mean exactly
  // that instead of signing the user out everywhere.
  const accessToken = signAccessToken({ sub: user.id, role: user.role, sid: session.id });
  const refreshToken = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);
  await AuthRepository.createRefreshToken({
    userId: user.id,
    tokenHash: hashToken(refreshToken),
    expiresAt: refreshExpiresAt,
    sessionId: session.id,
  });
  return { user: toAuthUser(user), tokens: { accessToken, refreshToken } };
}


/** Constant-time comparison for one-time codes. */
function codesMatch(expected: string, provided: string): boolean {
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, providedBuffer);
}

/**
 * Generate, store (10-min TTL) and send a fresh 6-digit verification code.
 *
 * Returns what actually happened rather than nothing, so callers can tell the
 * user "a code is on its way" or "wait 4 minutes" instead of guessing.
 */
async function sendPhoneCodeFor(phone: string): Promise<CodeSendClaim> {
  const claim = await claimCodeSend('phone-verification', phone);
  if (!claim.allowed) return claim;
  const code = numericOtp(6);
  await redis.set(phoneCodeKey(phone), code, {
    EX: config.emailCodeTtlMinutes * 60,
  });
  // The attempt counter is deliberately NOT cleared here. Clearing it on every
  // resend made the 5-guess cap meaningless: an attacker looped
  // resend -> 5 guesses -> resend and walked the whole code space.
  // Fire-and-forget: never block the API response on SMS latency. The code is
  // already in Redis, so verification works whether or not delivery succeeds.
  // WhatsApp first (free, instant, and not subject to SMS filtering), SMS when
  // the number is not on WhatsApp or the template is not approved yet.
  logDevCode('phone verification', phone, code);
  void sendVerificationCode(phone, code, { purpose: 'phone verification' }).catch((e) =>
    console.error('[code] send failed:', (e as Error).message),
  );
  return claim;
}

/** How long after rotation a refresh token may be replayed without burning the
 *  family - long enough for two tabs racing, short enough to catch theft. */
const REFRESH_REUSE_GRACE_MS = 60_000;

export const AuthService = {
  // ---- FR-AUTH-001 / 002: Registration ----
  async register(input: RegisterInput, ctx: ReqCtx) {
    // Respect the platform-wide "new signups" toggle (system settings).
    if (!systemSettings().general.signupsEnabled) {
      throw new AppError(403, 'Q-403', 'New sign-ups are temporarily disabled. Please check back soon.');
    }
    // A field no human ever sees, and no real client fills in. Scripted signups
    // post every field they find, so a value here is a bot. Answer as though it
    // worked: telling a bot why it failed only helps it adapt.
    if (input.website) {
      console.warn(`[signup] honeypot tripped from ${ctx.ip ?? 'unknown ip'} - ignoring`);
      return { verificationRequired: true, phone: normalizePhone(input.phone) };
    }

    // One address should not be able to mint accounts in bulk. Real households
    // and shared mobile gateways do share addresses, so the cap is per DAY and
    // generous rather than tight.
    // Counted on accounts CREATED, not attempts made: a real person who mistypes
    // their number or retries a failed submission must not spend somebody else's
    // quota on the shared gateway they happen to be behind.
    const capKey = ctx.ip ? `signup:ip:${ctx.ip}` : null;
    if (capKey) {
      const createdToday = Number((await redis.get(capKey)) ?? 0);
      if (createdToday >= config.auth.signupsPerIpPerDay) {
        console.warn(`[signup] ${ctx.ip} reached ${config.auth.signupsPerIpPerDay} accounts today`);
        throw new AppError(
          429,
          'Q-429',
          'Too many accounts have been created from this connection today. Please try again tomorrow.',
        );
      }
    }

    const phoneNumber = normalizePhone(input.phone);

    // The market gate, at the front door. Holding other people's money is
    // licensed country by country, so a number from a country we are not
    // authorised in must not be able to open an account - and must be turned
    // away BEFORE any personal data is stored, because collecting it first and
    // discovering the problem at verification is the thing to avoid.
    if (!isPhoneInEnabledMarket(phoneNumber)) {
      const markets = enabledMarketNames();
      console.log(`[signup] refused ${maskNumber(phoneNumber)} - outside the enabled markets`);
      throw new AppError(
        403,
        'Q-403-MARKET',
        markets.length === 1
          ? `BiZik is only available in ${markets[0]} at the moment. We are opening more countries as we are licensed in them.`
          : 'BiZik is not available in your country yet. We are opening more countries as we are licensed in them.',
      );
    }

    const existing = await AuthRepository.findUserByPhone(phoneNumber);
    if (existing) {
      throw new AppError(409, 'Q-409', 'An account with this phone number already exists');
    }
    // Email is optional, but if given it must be unique too.
    const email = input.email?.toLowerCase().trim() || null;
    if (email && (await AuthRepository.findUserByEmail(email))) {
      throw new AppError(409, 'Q-409', 'An account with this email already exists');
    }

    const passwordHash = await hashPassword(input.password);

    // Phone-first account - new users are a base CLIENT; freelancer is unlocked
    // later. The app is localised at signup: the preferred locale is taken from
    // the client, else francophone countries default to French, else the
    // platform's configured default language (system settings).
    const defaultLocale = systemSettings().general.defaultLocale;
    const mappedLocale = localeForCountry(input.country);
    const user = await AuthRepository.createUser({
      phone: phoneNumber,
      email,
      passwordHash,
      fullName: input.fullName,
      country: input.country,
      companyName: input.companyName,
      locale: input.locale ?? (mappedLocale === 'fr' ? 'fr' : defaultLocale),
      // The signup screens require the Terms + Privacy checkbox before they can
      // submit, so reaching here is the acceptance - record when it happened.
      termsAcceptedAt: new Date(),
      signupSource: ctx.client ?? 'web',
      signupIp: ctx.ip,
      signupUserAgent: ctx.userAgent?.slice(0, 400),
    });

    // The account exists, so it counts against the daily cap for this address.
    if (capKey) {
      const createdToday = await redis.incr(capKey);
      if (createdToday === 1) await redis.expire(capKey, 24 * 60 * 60);
    }

    // A public handle so other users can pay them without a phone number.
    await UsernameService.ensureFor(user.id, user.fullName).catch((error: unknown) =>
      console.error('[username] could not assign for', user.id, (error as Error).message),
    );

    // Provision the empty multi-currency wallet. A new user starts with zero
    // balances and no activity - real data appears only as they transact.
    await provisionUserWallets(user).catch((e) =>
      console.error('[provision] failed for', user.id, (e as Error).message),
    );

    // TEMPORARY (see config.auth.phoneVerificationRequired): with SMS delivery
    // blocked, demanding a code nobody receives locks every new user out. The
    // account is created and signed in, but `phoneVerified` stays FALSE - the
    // number is genuinely unproven, and saying otherwise in the database would
    // outlive this switch. When verification is turned back on, these users are
    // asked for a code on their next sign-in, which is exactly right.
    if (!config.auth.phoneVerificationRequired) {
      console.warn(`[auth] phone verification BYPASSED for a new account (${'*'.repeat(Math.max(0, phoneNumber.length - 4))}${phoneNumber.slice(-4)})`);
      // PENDING means "phone not verified yet". With verification bypassed that
      // state can never be left, so every account would sit PENDING for ever and
      // the console would read as a queue of people waiting on something.
      const activated = await AuthRepository.updateUser(user.id, { status: 'ACTIVE' });
      return issueSession(activated, ctx);
    }

    // SMS a verification code; the user must verify their phone before getting
    // a session (they proceed to the verify screen on the client).
    const claim = await sendPhoneCodeFor(phoneNumber);
    return {
      verificationRequired: true,
      phone: phoneNumber,
      // Whether a code actually went out, and when the next one may. A brand
      // new account is almost always `allowed`, but a second signup attempt on
      // the same number is not - and the verify screen has to know, or it
      // starts a countdown for a message that was never sent.
      codeSent: claim.allowed,
      retryAfterSeconds: claim.allowed ? claim.nextWaitSeconds : claim.retryAfterSeconds,
    };
  },

  // ---- FR-AUTH-003: Login (+ lockout) ----
  async login(input: LoginInput, ctx: ReqCtx) {
    // End users sign in by PHONE; platform staff by EMAIL. Resolve the account
    // from whichever identifier was supplied and key everything off it.
    const byPhone = !!input.phone;
    const identifier = byPhone ? normalizePhone(input.phone as string) : (input.email as string).toLowerCase();

    if (await redis.get(lockKey(identifier))) {
      throw new AppError(
        423,
        'Q-AUTH-LOCKED',
        `Account temporarily locked after too many attempts. Try again in ${config.login.lockMinutes} minutes.`,
      );
    }

    const user = byPhone
      ? await AuthRepository.findUserByPhone(identifier)
      : await AuthRepository.findUserByEmail(identifier);
    const ok = user?.passwordHash
      ? await verifyPassword(input.password, user.passwordHash)
      : false;

    const badCredentialsMessage = byPhone
      ? 'Invalid phone number or password. Please try again.'
      : 'Invalid email or password. Please try again.';

    if (!user || !ok) {
      await AuthRepository.recordLoginAttempt({
        userId: user?.id,
        email: identifier,
        ipAddress: ctx.ip,
        successful: false,
      });
      // Audit failed sign-ins for platform staff (security event).
      if (user && (STAFF_ROLES.has(user.role) || user.adminRoleId)) {
        void recordAudit({
          actorId: user.id,
          action: 'auth.login',
          entityType: 'Session',
          result: 'FAILED',
          ipAddress: ctx.ip,
          userAgent: ctx.userAgent,
          after: { reason: 'bad_password' },
        });
      }
      await this.registerFailedAttempt(identifier, user);
      throw new AppError(401, 'Q-401', badCredentialsMessage);
    }

    // An operator or AML decision (SUSPENDED / FROZEN / CLOSED) has to survive
    // a fresh sign-in. Revoking tokens alone did not: the account simply logged
    // in again and kept transacting.
    const loginBlocked = accountBlockedReason(user.status);
    if (loginBlocked || !canAccountAct(user.status)) {
      await AuthRepository.recordLoginAttempt({
        userId: user.id,
        email: identifier,
        ipAddress: ctx.ip,
        successful: false,
      });
      throw new AppError(403, 'Q-403-ACCOUNT', loginBlocked ?? 'This account cannot sign in right now.');
    }

    await redis.del(failKey(identifier));
    await AuthRepository.recordLoginAttempt({
      userId: user.id,
      email: identifier,
      ipAddress: ctx.ip,
      successful: true,
    });
    await AuthRepository.updateUser(user.id, { lastLoginAt: new Date() });

    // ---- Mandatory email OTP (MFA) for platform staff ----
    // Every platform operator (assigned an RBAC role) - and legacy staff roles -
    // always completes an emailed one-time code, regardless of any TOTP setup.
    if (STAFF_ROLES.has(user.role) || !!user.adminRoleId) {
      // Fail CLOSED: a staff/operator account with no email cannot satisfy the
      // mandatory MFA, so it must never be allowed to log in with a password only.
      if (!user.email) {
        throw new AppError(
          403,
          'Q-403',
          'This staff account has no email configured for MFA. Contact an administrator.',
        );
      }
      const challengeId = randomToken(16);
      const code = numericOtp(6);
      await redis.set(
        mfaKey(challengeId),
        JSON.stringify({ userId: user.id, codeHash: hashToken(code) }),
        { EX: config.otpTtlMinutes * 60 },
      );
      await enqueueEmail({ kind: 'admin-mfa', to: user.email, name: user.fullName, code });
      logDevCode('staff sign-in', user.email, code);
      return { mfaRequired: true, challengeId, email: maskEmail(user.email) };
    }

    // ---- End users must have a verified phone before a session is issued ----
    if (!user.phoneVerified && user.phone && config.auth.phoneVerificationRequired) {
      // Someone who abandoned signup gets a FRESH code here, not the stale one
      // - but if they have just been sent several, say how long to wait rather
      // than dropping them on a verify screen where nothing ever arrives.
      const claim = await sendPhoneCodeFor(user.phone);
      return {
        verificationRequired: true,
        phone: user.phone,
        codeSent: claim.allowed,
        retryAfterSeconds: claim.allowed ? claim.nextWaitSeconds : claim.retryAfterSeconds,
      };
    }

    // ---- FR-AUTH-004: 2FA challenge ----
    if (user.twoFactorEnabled) {
      const challengeId = randomToken(16);
      await redis.set(challengeKey(challengeId), user.id, {
        EX: config.otpTtlMinutes * 60,
      });
      return { twoFactorRequired: true, challengeId };
    }

    return issueSession(user, ctx);
  },

  // ---- Mandatory email OTP (MFA) for staff - verify the emailed code ----
  async verifyMfa(challengeId: string, code: string, ctx: ReqCtx) {
    const raw = await redis.get(mfaKey(challengeId));
    if (!raw) {
      throw new AppError(401, 'Q-401', 'Your sign-in code expired. Please log in again.');
    }
    const attempts = await redis.incr(mfaAttemptsKey(challengeId));
    if (attempts === 1) {
      await redis.expire(mfaAttemptsKey(challengeId), config.otpTtlMinutes * 60);
    }
    if (attempts > 5) {
      await redis.del(mfaKey(challengeId));
      throw new AppError(429, 'Q-429', 'Too many attempts. Please log in again.');
    }
    const { userId, codeHash } = JSON.parse(raw) as { userId: string; codeHash: string };
    if (hashToken(code) !== codeHash) {
      void recordAudit({
        actorId: userId,
        action: 'auth.login',
        entityType: 'Session',
        result: 'FAILED',
        ipAddress: ctx.ip,
        userAgent: ctx.userAgent,
        after: { reason: 'bad_mfa_code' },
      });
      throw new AppError(401, 'Q-401', 'Invalid code. Please try again.');
    }
    await redis.del(mfaKey(challengeId));
    await redis.del(mfaAttemptsKey(challengeId));
    const user = await AuthRepository.findUserById(userId);
    if (!user) throw new AppError(401, 'Q-401', 'Account not found. Please try again.');
    void recordAudit({
      actorId: user.id,
      action: 'auth.login',
      entityType: 'Session',
      result: 'SUCCESS',
      ipAddress: ctx.ip,
      userAgent: ctx.userAgent,
    });
    return issueSession(user, ctx);
  },

  /** Resend the staff MFA code for an active challenge. */
  async resendMfa(challengeId: string) {
    const raw = await redis.get(mfaKey(challengeId));
    if (!raw) {
      throw new AppError(401, 'Q-401', 'Your session expired. Please log in again.');
    }
    const { userId } = JSON.parse(raw) as { userId: string };
    const user = await AuthRepository.findUserById(userId);
    if (!user?.email) throw new AppError(401, 'Q-401', 'Account not found. Please try again.');
    const code = numericOtp(6);
    await redis.set(
      mfaKey(challengeId),
      JSON.stringify({ userId, codeHash: hashToken(code) }),
      { EX: config.otpTtlMinutes * 60 },
    );
    await redis.del(mfaAttemptsKey(challengeId));
    await enqueueEmail({ kind: 'admin-mfa', to: user.email, name: user.fullName, code });
    logDevCode('staff sign-in', user.email, code);
  },

  async registerFailedAttempt(identifier: string, user: User | null) {
    const count = await redis.incr(failKey(identifier));
    await redis.expire(failKey(identifier), config.login.lockMinutes * 60);
    if (count >= config.login.maxAttempts) {
      await redis.set(lockKey(identifier), '1', { EX: config.login.lockMinutes * 60 });
      await redis.del(failKey(identifier));
      // Notify the account owner that a lockout occurred (SMS for end users).
      if (user?.phone) {
        await sendSms(
          user.phone,
          `Your BiZik account was temporarily locked after too many sign-in attempts. It unlocks in ${config.login.lockMinutes} minutes.`,
        ).catch(() => undefined);
      }
    }
  },

  // ---- FR-AUTH-004: Verify the 2FA challenge ----
  async verifyTwoFactor(challengeId: string, code: string, ctx: ReqCtx) {
    const userId = await redis.get(challengeKey(challengeId));
    if (!userId) {
      throw new AppError(401, 'Q-401', 'Verification challenge expired. Please log in again.');
    }
    const user = await AuthRepository.findUserById(userId);
    if (!user) throw new AppError(401, 'Q-401', 'Account not found. Please try again.');

    // Cap guesses per challenge: a 6-digit code with unlimited attempts is not
    // a second factor. The staff MFA path already does this.
    const attemptsKey = `auth:2fa-att:${challengeId}`;
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) await redis.expire(attemptsKey, 10 * 60);
    if (attempts > 5) {
      await redis.del(challengeKey(challengeId));
      await redis.del(attemptsKey);
      throw new AppError(429, 'Q-429', 'Too many attempts. Please log in again.');
    }

    const valid = await this.checkSecondFactor(user.id, code);
    if (!valid) throw new AppError(401, 'Q-401', 'Invalid verification code. Please try again.');

    await redis.del(attemptsKey);
    await redis.del(challengeKey(challengeId));
    return issueSession(user, ctx);
  },

  /** Verify a TOTP code or a one-time backup code for a user. */
  async checkSecondFactor(userId: string, code: string): Promise<boolean> {
    const method = await AuthRepository.findTotpMethod(userId);
    // Decrypted at the point of use. `decryptField` passes a legacy plaintext
    // value through unchanged, so enrolments made before encryption still work.
    if (method?.verified && method.secret && verifyTotp(code, decryptField(method.secret))) {
      return true;
    }
    // Fall back to one-time backup codes.
    const codes = await AuthRepository.findUnusedBackupCodes(userId);
    const match = codes.find((c) => c.codeHash === hashToken(code));
    if (match) {
      await AuthRepository.markBackupCodeUsed(match.id);
      return true;
    }
    return false;
  },

  // ---- FR-AUTH-007: Refresh with rotation ----
  async refresh(refreshToken: string, ctx: ReqCtx) {
    const record = await AuthRepository.findRefreshTokenByHash(hashToken(refreshToken));
    if (!record || record.expiresAt < new Date()) {
      throw new AppError(401, 'Q-401', 'Invalid or expired refresh token');
    }
    if (record.revokedAt) {
      // This token was already rotated. Presenting it again means two parties
      // hold it, so the family is burned rather than quietly refused. A short
      // grace window absorbs the honest case: two tabs refreshing at once.
      const rotatedMsAgo = Date.now() - record.revokedAt.getTime();
      if (rotatedMsAgo > REFRESH_REUSE_GRACE_MS) {
        await AuthRepository.revokeAllRefreshTokens(record.userId);
        if (record.sessionId) await AuthRepository.revokeSession(record.sessionId);
        console.warn(`[auth] refresh token reuse detected for user ${record.userId} - sessions revoked`);
      }
      throw new AppError(401, 'Q-401', 'Invalid or expired refresh token');
    }
    const user = await AuthRepository.findUserById(record.userId);
    if (!user) throw new AppError(401, 'Q-401', 'Account not found. Please try again.');
    const refreshBlocked = accountBlockedReason(user.status);
    if (refreshBlocked || !canAccountAct(user.status)) {
      // Kill the whole family: a blocked account keeps no live session.
      await AuthRepository.revokeAllRefreshTokens(user.id);
      throw new AppError(403, 'Q-403-ACCOUNT', refreshBlocked ?? 'This account cannot sign in right now.');
    }

    // ---- Device binding ----
    // Rotation with reuse detection catches a stolen token used TWICE. It
    // cannot see one stolen and used ONCE before the owner refreshes again -
    // for that single use the thief looks exactly like the owner. A refresh
    // arriving from a different kind of device is the signal that closes most
    // of that gap.
    //
    // Treated as theft, not as an anomaly to note: the whole family is revoked
    // and both parties must sign in again. That is an inconvenience for the
    // owner and a dead end for the thief, which is the right way round.
    if (record.sessionId) {
      const session = await AuthRepository.findSessionById(record.sessionId);
      if (session && deviceChanged(session.userAgent, ctx.userAgent)) {
        await AuthRepository.revokeAllRefreshTokens(record.userId);
        await AuthRepository.revokeSession(record.sessionId);
        captureError(
          new Error(
            `Refresh token presented from a different device ` +
              `(session ${deviceFingerprint(session.userAgent)}, request ${deviceFingerprint(ctx.userAgent)})`,
          ),
          { scope: 'auth.device-binding', severity: 'critical', userId: record.userId },
        );
        throw new AppError(401, 'Q-401', 'Invalid or expired refresh token');
      }
    }

    // Rotate: revoke the presented token and issue a fresh pair, keeping it on
    // the same session.
    await AuthRepository.revokeRefreshToken(record.id);

    const newRefresh = generateRefreshToken();
    await AuthRepository.createRefreshToken({
      userId: user.id,
      tokenHash: hashToken(newRefresh),
      expiresAt: new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000),
      rotatedFromId: record.id,
      sessionId: record.sessionId,
    });
    void ctx;
    const accessToken = signAccessToken({
      sub: user.id,
      role: user.role,
      sid: record.sessionId ?? undefined,
    });
    return { accessToken, refreshToken: newRefresh, sessionId: record.sessionId };
  },

  // ---- FR-AUTH-007: Logout invalidates all of a user's tokens ----
  async logout(userId: string) {
    await this.revokeEverything(userId);
  },

  async revokeEverything(userId: string) {
    await AuthRepository.revokeAllRefreshTokens(userId);
    await AuthRepository.revokeAllSessions(userId);
    // Invalidate every already-issued access token for this user.
    await redis.set(revokeBeforeKey(userId), Math.floor(Date.now() / 1000).toString(), {
      EX: 30 * 24 * 60 * 60,
    });
  },

  async me(userId: string) {
    const user = await AuthRepository.findUserWithAdminRole(userId);
    if (!user) throw new AppError(404, 'Q-404', 'Account not found. Please try again.');
    return toAuthUser(user, user.adminRole);
  },

  /**
   * Legacy "activate" endpoint. Verification is now the full KYC flow
   * (POST /kyc/submit - ID + selfie + liveness, SRS MOD-02). This only saves
   * the phone + country a user may supply; it MUST NOT confer a KYC tier or
   * unlock financial actions - that would bypass identity verification.
   */
  async verifyAccount(userId: string, data: { country: string; phone: string }) {
    const user = await AuthRepository.findUserById(userId);
    if (!user) throw new AppError(404, 'Q-404', 'Account not found. Please try again.');
    const updated = await AuthRepository.updateUser(userId, {
      country: data.country,
      phone: data.phone,
    });
    return toAuthUser(updated);
  },

  async listSessions(userId: string) {
    const sessions = await AuthRepository.listSessions(userId);
    return sessions.map((s) => ({
      id: s.id,
      ipAddress: s.ipAddress,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
    }));
  },

  /**
   * End ONE sign-in. This used to only write `revokedAt` on a row nothing read,
   * so a session a user revoked kept working until its token expired. Now the
   * session's refresh tokens are revoked and its access tokens are rejected.
   */
  async revokeSession(userId: string, sessionId: string) {
    const session = await AuthRepository.findSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new AppError(404, 'Q-404', 'Session not found');
    }
    await AuthRepository.revokeSession(sessionId);
    await AuthRepository.revokeRefreshTokensForSession(sessionId);
    // Outlives any access token that session could still be carrying.
    await redis.set(revokedSessionKey(sessionId), '1', {
      EX: config.jwt.refreshTtlDays * 24 * 60 * 60,
    });
  },

  // ---- FR-AUTH-001/002: Phone verification by one-time code ----
  async verifyPhoneCode(rawPhone: string, code: string, ctx: ReqCtx) {
    const phoneNumber = normalizePhone(rawPhone);
    const key = phoneCodeKey(phoneNumber);
    const stored = await redis.get(key);
    if (!stored) {
      throw new AppError(400, 'Q-400', 'Your code has expired. Request a new one.');
    }
    // Cap wrong guesses so the code can't be brute-forced into a full
    // session (this flow issues a session on success). Mirrors the reset-OTP cap.
    const attemptsKey = phoneCodeAttemptsKey(phoneNumber);
    const attempts = await redis.incr(attemptsKey);
    if (attempts === 1) {
      await redis.expire(attemptsKey, config.emailCodeTtlMinutes * 60);
    }
    if (attempts > 5) {
      await redis.del(key);
      await redis.del(attemptsKey);
      throw new AppError(429, 'Q-429', 'Too many attempts. Request a new code.');
    }
    if (!codesMatch(stored, code)) {
      throw new AppError(401, 'Q-401', 'Invalid verification code');
    }
    // Delete the code + attempt counter immediately once verified (single-use).
    await redis.del(key);
    await redis.del(attemptsKey);
    // The escalating wait is forgotten too. Someone who needed three codes to
    // get in today should not still be on the five-minute wait the next time
    // they legitimately need one.
    await clearCodeCooldown('phone-verification', phoneNumber);

    const user = await AuthRepository.findUserByPhone(phoneNumber);
    if (!user) throw new AppError(404, 'Q-404', 'Account not found. Please try again.');

    const updated = await AuthRepository.updateUser(user.id, {
      phoneVerified: true,
      status: 'ACTIVE',
      // A proven phone number is Tier 1 (Basic): not enough to move money, but
      // more than a signup form - there is a real, reachable person behind it.
      // Raised rather than assigned, so someone who already passed KYC and is
      // re-verifying their phone is not dropped from Verified back to Basic.
      kycTier: tierAfterEarning(user.kycTier, BASIC_TIER),
    });
    // Verified - establish the session.
    return issueSession(updated, ctx);
  },

  /**
   * Re-send the verification code.
   *
   * Unlike the implicit sends on register and login, this one is a BUTTON the
   * user pressed, so a refusal has to be an error they can read. Returning
   * quietly is what left people staring at an OTP screen with nothing coming.
   */
  async resendPhoneCode(rawPhone: string) {
    const phoneNumber = normalizePhone(rawPhone);
    const user = await AuthRepository.findUserByPhone(phoneNumber);
    // Already verified, or no such account: nothing to send, and saying which
    // would turn this endpoint into a way to test whether a number is
    // registered. The cooldown is not consumed either, since nothing was sent.
    if (!user || user.phoneVerified) return { sent: false as const, retryAfterSeconds: 0 };

    const claim = await sendPhoneCodeFor(phoneNumber);
    if (!claim.allowed) throw codeCooldownError(claim);
    return { sent: true as const, retryAfterSeconds: claim.nextWaitSeconds };
  },

  // ---- FR-AUTH-006: Password reset (by phone → SMS OTP code) ----
  async forgotPassword(rawPhone: string) {
    const phoneNumber = normalizePhone(rawPhone);

    // The cooldown is claimed BEFORE the account lookup, deliberately. If it
    // ran only for real accounts, the wait we report back would differ between
    // a registered number and an unregistered one - turning a helpful "wait 5
    // minutes" into a way to test which numbers have accounts here. Claiming
    // first makes every number behave identically. It costs nothing: the keys
    // are per phone, so a slot burned on a number with no account harms no one.
    const claim = await claimCodeSend('password-reset', phoneNumber);
    if (!claim.allowed) {
      return { retryAfterSeconds: claim.retryAfterSeconds, waitReason: claim.reason };
    }

    const user = await AuthRepository.findUserByPhone(phoneNumber);
    // The CALLER is always told it worked, so a stranger cannot learn which
    // numbers have accounts. The log is a different audience: without this,
    // a reset for a mistyped number looks exactly like a broken SMS rail.
    if (!user || !user.phone) {
      console.log(`[code] password reset asked for ${maskNumber(phoneNumber)} - no such account`);
      return { retryAfterSeconds: claim.nextWaitSeconds };
    }
    const code = numericOtp(6);
    await redis.set(pwResetKey(phoneNumber), code, {
      EX: config.passwordResetTtlMinutes * 60,
    });
    // Attempts are NOT reset by requesting a new code - see sendPhoneCodeFor.
    // Fire-and-forget so the response isn't blocked by SMS latency.
    logDevCode('password reset', user.phone, code);
    void sendVerificationCode(user.phone, code, { purpose: 'password reset' }).catch((e) =>
      console.error('[code] reset code send failed:', (e as Error).message),
    );
    return { retryAfterSeconds: claim.nextWaitSeconds };
  },

  /**
   * Verify the SMS reset code. On success, mint a single-use reset token (the
   * same token `resetPassword` consumes) so the "set a new password" step never
   * has to re-send the code. Wrong codes are attempt-limited to deter guessing.
   */
  async verifyResetOtp(rawPhone: string, code: string): Promise<{ token: string }> {
    const phoneNumber = normalizePhone(rawPhone);
    const stored = await redis.get(pwResetKey(phoneNumber));
    if (!stored) {
      throw new AppError(400, 'Q-400', 'Your code has expired. Request a new one.');
    }
    const attempts = await redis.incr(pwResetAttemptsKey(phoneNumber));
    if (attempts === 1) {
      await redis.expire(pwResetAttemptsKey(phoneNumber), config.passwordResetTtlMinutes * 60);
    }
    if (attempts > 5) {
      await redis.del(pwResetKey(phoneNumber));
      throw new AppError(429, 'Q-429', 'Too many attempts. Request a new code.');
    }
    if (!codesMatch(stored, code)) {
      throw new AppError(401, 'Q-401', 'Invalid verification code');
    }
    // Correct - burn the code and issue the reset token.
    await redis.del(pwResetKey(phoneNumber));
    await redis.del(pwResetAttemptsKey(phoneNumber));
    await clearCodeCooldown('password-reset', phoneNumber);

    const user = await AuthRepository.findUserByPhone(phoneNumber);
    if (!user) throw new AppError(404, 'Q-404', 'Account not found. Please try again.');
    const token = randomToken(24);
    await AuthRepository.createPasswordReset({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + config.passwordResetTtlMinutes * 60 * 1000),
    });
    return { token };
  },

  async resetPassword(token: string, newPassword: string) {
    const record = await AuthRepository.findPasswordReset(hashToken(token));
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new AppError(400, 'Q-400', 'Reset link is invalid or expired');
    }
    const passwordHash = await hashPassword(newPassword);
    await AuthRepository.updateUser(record.userId, { passwordHash });
    await AuthRepository.markPasswordResetUsed(record.id);
    // FR-AUTH-007: invalidate all sessions on password change.
    await this.revokeEverything(record.userId);
  },

  /** Change password for a signed-in user (verifies the current one). */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await AuthRepository.findUserById(userId);
    if (!user?.passwordHash) throw new AppError(404, 'Q-404', 'Account not found');
    const ok = await verifyPassword(currentPassword, user.passwordHash);
    if (!ok) throw new AppError(400, 'Q-400', 'Your current password is incorrect.');
    if (await verifyPassword(newPassword, user.passwordHash)) {
      throw new AppError(400, 'Q-400', 'New password must differ from the current one.');
    }
    const passwordHash = await hashPassword(newPassword);
    await AuthRepository.updateUser(userId, { passwordHash });
    // FR-AUTH-007: a password change invalidates all sessions/tokens.
    await this.revokeEverything(userId);
  },

  // ---- FR-AUTH-004: 2FA enrolment ----
  async setupTwoFactor(userId: string) {
    const user = await AuthRepository.findUserById(userId);
    if (!user) throw new AppError(404, 'Q-404', 'Account not found. Please try again.');
    const secret = generateTotpSecret();
    await AuthRepository.upsertTotpMethod(userId, secret);
    return {
      secret,
      otpauthUrl: totpUri(secret, user.email ?? user.phone ?? user.id),
    };
  },

  async enableTwoFactor(userId: string, code: string) {
    const method = await AuthRepository.findTotpMethod(userId);
    if (!method?.secret) {
      throw new AppError(400, 'Q-400', 'Start 2FA setup before enabling it');
    }
    if (!verifyTotp(code, decryptField(method.secret))) {
      throw new AppError(401, 'Q-401', 'Invalid authenticator code');
    }
    await AuthRepository.markTotpVerified(userId);
    await AuthRepository.updateUser(userId, { twoFactorEnabled: true });

    // Generate 8 one-time backup codes (SRS FR-AUTH-004).
    const backupCodes = Array.from({ length: 8 }, () => numericOtp(10));
    await AuthRepository.replaceBackupCodes(userId, backupCodes.map(hashToken));
    return { backupCodes };
  },

  async disableTwoFactor(userId: string, code: string) {
    const valid = await this.checkSecondFactor(userId, code);
    if (!valid) throw new AppError(401, 'Q-401', 'Invalid verification code');
    await AuthRepository.deleteTwoFactor(userId);
    await AuthRepository.deleteBackupCodes(userId);
    await AuthRepository.updateUser(userId, { twoFactorEnabled: false });
  },
};
