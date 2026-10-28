import { describe, expect, it } from 'vitest';

import { numericOtp, OTP_CODE_LENGTH } from '../lib/jwt';
import { verifyPhoneCodeSchema, verifyResetOtpSchema } from './auth.validation';

/**
 * The code the server SENDS must be a code the server ACCEPTS.
 *
 * These two halves were written out separately and drifted: `numericOtp(6)`
 * generated six digits while validation demanded exactly four, so every phone
 * verification and every password reset was rejected by the schema before the
 * code was ever compared. From any client, and from curl. It went unnoticed
 * because phone verification was switched off at the time.
 *
 * This is the regression test for that: it does not assert a number, it asserts
 * that the generator and the validators agree.
 */
const PHONE = '+237650035675';

describe('one-time code length', () => {
  it('accepts a code the generator actually produced', () => {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const code = numericOtp();
      expect(verifyPhoneCodeSchema.safeParse({ phone: PHONE, code }).success).toBe(true);
      expect(verifyResetOtpSchema.safeParse({ phone: PHONE, code }).success).toBe(true);
    }
  });

  it('generates exactly the advertised number of digits, leading zeros included', () => {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      expect(numericOtp()).toMatch(new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`));
    }
  });

  it('rejects a code of any other length', () => {
    const tooShort = '1'.repeat(OTP_CODE_LENGTH - 1);
    const tooLong = '1'.repeat(OTP_CODE_LENGTH + 1);
    expect(verifyPhoneCodeSchema.safeParse({ phone: PHONE, code: tooShort }).success).toBe(false);
    expect(verifyPhoneCodeSchema.safeParse({ phone: PHONE, code: tooLong }).success).toBe(false);
  });

  it('rejects anything that is not all digits', () => {
    for (const code of ['12a456', ' 123456', '123456 ', '12-456', '']) {
      expect(verifyPhoneCodeSchema.safeParse({ phone: PHONE, code }).success).toBe(false);
    }
  });
});
