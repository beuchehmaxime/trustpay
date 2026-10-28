import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import { config } from '../config/env';

export interface AccessClaims {
  sub: string; // user id
  role: string;
  /**
   * The sign-in this token was issued for. Present so ONE device can be signed
   * out: without it, revocation could only be all-or-nothing per user.
   */
  sid?: string;
  iat?: number; // issued-at (epoch seconds, set by jsonwebtoken)
  exp?: number;
}

/** Sign a short-lived access token (SRS NFR-SEC-004: 24h, HS256 dev / RS256 prod). */
export function signAccessToken(claims: { sub: string; role: string; sid?: string }): string {
  return jwt.sign({ ...claims, typ: 'access' }, config.jwt.accessSecret, {
    // `expiresIn` accepts a number of seconds or a vercel/ms string ("7d").
    expiresIn: config.jwt.accessTtl as jwt.SignOptions['expiresIn'],
    algorithm: 'HS256',
  });
}

/** Verify and decode an access token; throws if invalid/expired. */
export function verifyAccessToken(token: string): AccessClaims {
  // Pin the algorithm, and refuse any token minted for another purpose. Receipt
  // tokens are signed with this same secret and travel in shareable URLs, so
  // without this check one of them could be replayed as a full session.
  const claims = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] }) as AccessClaims & {
    typ?: string;
  };
  if (claims.typ && claims.typ !== 'access') {
    throw new Error('Not an access token');
  }
  return claims;
}

/**
 * Short-lived token that authorises a single transaction receipt PDF. Used so
 * the PDF can be opened in an external browser (which can't send an auth header)
 * without exposing the user's session token.
 */
export function signReceiptToken(userId: string, reference: string): string {
  // Short TTL: these tokens end up in shared links and in proxy access logs.
  return jwt.sign({ sub: userId, ref: reference, typ: 'receipt' }, config.jwt.accessSecret, {
    expiresIn: '10m',
    algorithm: 'HS256',
  });
}

/** Verify a receipt token; throws if invalid/expired/not a receipt token. */
export function verifyReceiptToken(token: string): { userId: string; reference: string } {
  const decoded = jwt.verify(token, config.jwt.accessSecret, { algorithms: ['HS256'] }) as {
    sub?: string;
    ref?: string;
    typ?: string;
  };
  if (decoded.typ !== 'receipt' || !decoded.sub || !decoded.ref) {
    throw new Error('Not a valid receipt token');
  }
  return { userId: decoded.sub, reference: decoded.ref };
}

/** Generate an opaque, high-entropy refresh token (stored hashed in the DB). */
export function generateRefreshToken(): string {
  return crypto.randomBytes(48).toString('hex');
}

/** SHA-256 of a token for at-rest storage (refresh tokens, reset tokens). */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** A short random URL-safe token (email verification, password reset). */
export function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * How many digits a one-time code has, everywhere.
 *
 * Both the generator below and the request validators derive from this. They
 * used to be written out separately, and drifted: the server sent six digits
 * while validation demanded exactly four, so every phone verification and
 * password reset was rejected before the code was even compared.
 */
export const OTP_CODE_LENGTH = 6;

/** A numeric OTP of the given length (SMS / WhatsApp / email 2FA codes). */
export function numericOtp(length = OTP_CODE_LENGTH): string {
  const max = 10 ** length;
  return crypto.randomInt(0, max).toString().padStart(length, '0');
}
