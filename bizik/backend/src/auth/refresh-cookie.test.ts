import { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';

import { readRefreshToken, respondWithSession, wantsCookieAuth } from './refresh-cookie';

/**
 * Browser clients keep the refresh token in an httpOnly cookie; the mobile app
 * cannot (React Native has no dependable cookie jar) and must keep receiving it
 * in the body. These tests pin both halves of that contract - getting it wrong
 * either leaves a 90-day credential readable by any script, or signs every
 * mobile user out.
 */
const request = (headers: Record<string, string>, cookies: Record<string, string> = {}) =>
  ({
    header: (name: string) => headers[name.toLowerCase()],
    cookies,
  }) as unknown as Request;

const response = () => {
  const cookie = vi.fn();
  return { res: { cookie } as unknown as Response, cookie };
};

describe('refresh cookie mode', () => {
  const tokens = { accessToken: 'access-token', refreshToken: 'refresh-token' };

  it('strips the refresh token from the body and sets a cookie for cookie clients', () => {
    const { res, cookie } = response();
    const body = respondWithSession(request({ 'x-auth-mode': 'cookie' }), res, { user: {}, tokens }) as {
      tokens: Record<string, string>;
    };
    expect(body.tokens.accessToken).toBe('access-token');
    expect(body.tokens.refreshToken).toBeUndefined();
    const [name, value, options] = cookie.mock.calls[0];
    expect(name).toBe('bizik_rt');
    expect(value).toBe('refresh-token');
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.path).toBe('/api/v1/auth');
  });

  it('leaves the mobile contract alone when the client does not ask for cookies', () => {
    const { res, cookie } = response();
    const body = respondWithSession(request({}), res, { user: {}, tokens }) as {
      tokens: Record<string, string>;
    };
    expect(body.tokens.refreshToken).toBe('refresh-token');
    expect(cookie).not.toHaveBeenCalled();
  });

  it('passes through responses that carry no tokens (MFA required, verify phone)', () => {
    const { res, cookie } = response();
    const challenge = { mfaRequired: true, challengeId: 'abc' };
    expect(respondWithSession(request({ 'x-auth-mode': 'cookie' }), res, challenge)).toEqual(challenge);
    expect(cookie).not.toHaveBeenCalled();
  });

  it('prefers the cookie over a body token, and falls back to the body', () => {
    expect(readRefreshToken(request({}, { bizik_rt: 'from-cookie' }), 'from-body')).toBe('from-cookie');
    expect(readRefreshToken(request({}), 'from-body')).toBe('from-body');
    expect(readRefreshToken(request({}))).toBeUndefined();
  });

  it('only treats an explicit header as cookie mode', () => {
    expect(wantsCookieAuth(request({ 'x-auth-mode': 'cookie' }))).toBe(true);
    expect(wantsCookieAuth(request({ 'x-auth-mode': 'COOKIE' }))).toBe(true);
    expect(wantsCookieAuth(request({}))).toBe(false);
  });
});
