import { Request, Response } from 'express';

import { AppError, asyncHandler } from '../lib/errors';
import { AuthService } from './auth.service';
import {
  clearRefreshCookie,
  readRefreshToken,
  respondWithSession,
  setRefreshCookie,
  wantsCookieAuth,
} from './refresh-cookie';
import {
  activateFreelancerSchema,
  changePasswordSchema,
  disable2faSchema,
  enable2faSchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  loginSchema,
  mfaResendSchema,
  mfaVerifySchema,
  refreshSchema,
  registerSchema,
  resendCodeSchema,
  resetPasswordSchema,
  twoFactorVerifySchema,
  verifyPhoneCodeSchema,
} from './auth.validation';

const ALLOWED_CLIENTS = new Set(['web', 'mobile', 'whatsapp']);

const ctxFrom = (req: Request) => {
  // Clients name themselves; anything unrecognised is recorded as "web" rather
  // than trusted, since the header is attacker-controlled like any other.
  const claimed = String(req.header('x-bizik-client') ?? '').toLowerCase();
  return {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    client: ALLOWED_CLIENTS.has(claimed) ? claimed : 'web',
  };
};

const userId = (req: Request) => {
  if (!req.user) throw new AppError(401, 'Q-401', 'Authentication required');
  return req.user.id;
};

export const AuthController = {
  register: asyncHandler(async (req: Request, res: Response) => {
    const input = registerSchema.parse(req.body);
    const result = await AuthService.register(input, ctxFrom(req));
    res.status(201).json(result);
  }),

  login: asyncHandler(async (req: Request, res: Response) => {
    const input = loginSchema.parse(req.body);
    res.json(respondWithSession(req, res, await AuthService.login(input, ctxFrom(req))));
  }),

  verifyTwoFactor: asyncHandler(async (req: Request, res: Response) => {
    const { challengeId, code } = twoFactorVerifySchema.parse(req.body);
    res.json(
      respondWithSession(req, res, await AuthService.verifyTwoFactor(challengeId, code, ctxFrom(req))),
    );
  }),

  verifyMfa: asyncHandler(async (req: Request, res: Response) => {
    const { challengeId, code } = mfaVerifySchema.parse(req.body);
    res.json(respondWithSession(req, res, await AuthService.verifyMfa(challengeId, code, ctxFrom(req))));
  }),

  resendMfa: asyncHandler(async (req: Request, res: Response) => {
    const { challengeId } = mfaResendSchema.parse(req.body);
    await AuthService.resendMfa(challengeId);
    res.json({ success: true });
  }),

  refresh: asyncHandler(async (req: Request, res: Response) => {
    const { refreshToken: bodyToken } = refreshSchema.parse(req.body ?? {});
    const presented = readRefreshToken(req, bodyToken);
    if (!presented) throw new AppError(401, 'Q-401', 'Invalid or expired refresh token');
    const result = await AuthService.refresh(presented, ctxFrom(req));
    // Cookie clients get the rotated token straight back into the cookie and
    // never see it; everyone else keeps the body contract.
    if (wantsCookieAuth(req)) {
      setRefreshCookie(res, result.refreshToken);
      res.json({ accessToken: result.accessToken });
      return;
    }
    res.json({ accessToken: result.accessToken, refreshToken: result.refreshToken });
  }),

  logout: asyncHandler(async (req: Request, res: Response) => {
    await AuthService.logout(userId(req));
    clearRefreshCookie(res);
    res.json({ success: true });
  }),

  me: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AuthService.me(userId(req)));
  }),

  activateFreelancer: asyncHandler(async (req: Request, res: Response) => {
    const input = activateFreelancerSchema.parse(req.body);
    res.json(await AuthService.verifyAccount(userId(req), input));
  }),

  changePassword: asyncHandler(async (req: Request, res: Response) => {
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);
    await AuthService.changePassword(userId(req), currentPassword, newPassword);
    res.json({ success: true });
  }),

  listSessions: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AuthService.listSessions(userId(req)));
  }),

  revokeSession: asyncHandler(async (req: Request, res: Response) => {
    await AuthService.revokeSession(userId(req), req.params.id);
    res.json({ success: true });
  }),

  verifyPhoneCode: asyncHandler(async (req: Request, res: Response) => {
    const { phone, code } = verifyPhoneCodeSchema.parse(req.body);
    res.json(
      respondWithSession(req, res, await AuthService.verifyPhoneCode(phone, code, ctxFrom(req))),
    );
  }),

  resendCode: asyncHandler(async (req: Request, res: Response) => {
    const { phone } = resendCodeSchema.parse(req.body);
    // The service throws a 429 carrying the wait when it is too soon, so the
    // only thing reaching here is a send that happened (or a number with
    // nothing to send to). `retryAfterSeconds` is when the NEXT one may go.
    const result = await AuthService.resendPhoneCode(phone);
    res.json({ success: true, ...result });
  }),

  forgotPassword: asyncHandler(async (req: Request, res: Response) => {
    const { phone } = forgotPasswordSchema.parse(req.body);
    // Always `success: true`, whether or not the number has an account - the
    // one thing this endpoint must never reveal. The wait is safe to return
    // because the cooldown is claimed before the account lookup, so it reads
    // the same for a registered number and an unregistered one.
    const result = await AuthService.forgotPassword(phone);
    res.json({ success: true, ...result });
  }),

  verifyResetOtp: asyncHandler(async (req: Request, res: Response) => {
    const { phone, code } = verifyResetOtpSchema.parse(req.body);
    res.json(await AuthService.verifyResetOtp(phone, code));
  }),

  resetPassword: asyncHandler(async (req: Request, res: Response) => {
    const { token, password } = resetPasswordSchema.parse(req.body);
    await AuthService.resetPassword(token, password);
    res.json({ success: true });
  }),

  setupTwoFactor: asyncHandler(async (req: Request, res: Response) => {
    res.json(await AuthService.setupTwoFactor(userId(req)));
  }),

  enableTwoFactor: asyncHandler(async (req: Request, res: Response) => {
    const { code } = enable2faSchema.parse(req.body);
    res.json(await AuthService.enableTwoFactor(userId(req), code));
  }),

  disableTwoFactor: asyncHandler(async (req: Request, res: Response) => {
    const { code } = disable2faSchema.parse(req.body);
    await AuthService.disableTwoFactor(userId(req), code);
    res.json({ success: true });
  }),
};
