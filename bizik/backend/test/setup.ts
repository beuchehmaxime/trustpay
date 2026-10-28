/**
 * Global test setup. Runs before any test module (and therefore before
 * `src/config/env.ts` reads `process.env`), so we can pin deterministic,
 * non-secret values for the crypto/JWT helpers under test. These are test-only
 * placeholders - never real secrets.
 */
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';
process.env.KYC_ENC_KEY = process.env.KYC_ENC_KEY || 'test-kyc-encryption-key';

// Keep the live FX feed from ever firing during unit tests (it is not started
// on import, but this makes the intent explicit and hermetic).
process.env.FX_FEED_ENABLED = 'false';
