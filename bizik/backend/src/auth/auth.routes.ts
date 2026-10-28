import { Router } from 'express';

import { requireAuth } from '../middleware/auth.middleware';
import { sensitiveLimiter } from '../middleware/rate-limit';
import { AuthController } from './auth.controller';

const router = Router();

// ---- Public ---- (credential / OTP / reset endpoints get the stricter limiter)
router.post('/register', sensitiveLimiter, AuthController.register);
router.post('/login', sensitiveLimiter, AuthController.login);
router.post('/2fa/verify', sensitiveLimiter, AuthController.verifyTwoFactor);
router.post('/mfa/verify', sensitiveLimiter, AuthController.verifyMfa);
router.post('/mfa/resend', sensitiveLimiter, AuthController.resendMfa);
router.post('/refresh', sensitiveLimiter, AuthController.refresh);
router.post('/verify-phone', sensitiveLimiter, AuthController.verifyPhoneCode);
router.post('/resend-code', sensitiveLimiter, AuthController.resendCode);
router.post('/forgot-password', sensitiveLimiter, AuthController.forgotPassword);
router.post('/reset-password/verify', sensitiveLimiter, AuthController.verifyResetOtp);
router.post('/reset-password', sensitiveLimiter, AuthController.resetPassword);

// ---- Authenticated ----
router.get('/me', requireAuth, AuthController.me);
router.post('/freelancer/activate', requireAuth, AuthController.activateFreelancer);
router.post('/logout', requireAuth, AuthController.logout);
router.post('/change-password', requireAuth, AuthController.changePassword);

router.get('/sessions', requireAuth, AuthController.listSessions);
router.delete('/sessions/:id', requireAuth, AuthController.revokeSession);

router.post('/2fa/setup', requireAuth, AuthController.setupTwoFactor);
router.post('/2fa/enable', requireAuth, AuthController.enableTwoFactor);
router.post('/2fa/disable', requireAuth, AuthController.disableTwoFactor);

export default router;
