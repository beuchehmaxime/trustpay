/**
 * How many digits every one-time code has.
 *
 * The backend generates six (`numericOtp(6)`) for phone verification, password
 * reset, staff MFA and the payout-number check alike. The clients had four
 * hardcoded in six different places, which made verification not merely
 * awkward but IMPOSSIBLE: the input renders exactly this many boxes, so a
 * six-digit code could never be typed into a four-box field, and the submit
 * button never enabled.
 *
 * One constant, so the next screen that asks for a code cannot get it wrong.
 * If the backend ever changes length, this is the only line to follow.
 */
export const CODE_LENGTH = 6;
