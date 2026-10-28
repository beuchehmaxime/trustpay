/**
 * Read a fee rate from the environment, as a FRACTION (0.025 = 2.5%).
 *
 * The fee maths multiplies by this number directly, so its unit decides what
 * people pay. Production shipped with FEE_FREELANCER_PCT=10, FEE_EXPRESS_PCT=5
 * and FEE_FX_MARGIN_PCT=1 - clearly meant as 10%, 5% and 1% - which the old
 * `Number(value) || default` read as 1000%, 500% and 100%: releasing a milestone
 * would have credited the freelancer a NEGATIVE amount. It also turned
 * FEE_CLIENT_PCT=0 ("no client fee") into the 3.5% default, because 0 is falsy.
 *
 * Rules:
 *   - unset or blank          -> the default
 *   - 0                       -> zero (an explicit "no fee")
 *   - between 0 and 1         -> already a fraction, used as-is
 *   - 1 or more, or ending in % -> a percentage, divided by 100 (10 -> 0.10)
 *   - negative, not a number,
 *     or 50% and above        -> rejected: the default, with a loud warning
 *
 * No fee on this platform is anywhere near 50%, so anything that lands there
 * is a mistake, and failing closed to the default is safer than charging it.
 */
export const MAX_FEE_RATE = 0.5;

export interface FeeRateReading {
  rate: number;
  /** Why the raw value was changed or ignored, for the startup log. */
  note?: string;
}

export function parseFeeRate(raw: string | undefined, fallback: number): FeeRateReading {
  if (raw === undefined || raw.trim() === '') return { rate: fallback };
  // "0.5%" is half a percent, whatever the number looks like on its own.
  const hasPercentSign = raw.trim().endsWith('%');
  const value = Number(raw.trim().replace(/%$/, ''));
  if (!Number.isFinite(value) || value < 0) {
    return { rate: fallback, note: `"${raw}" is not a valid fee; using the default ${fallback}` };
  }
  if (value === 0) return { rate: 0 };
  const asPercent = hasPercentSign || value >= 1;
  const rate = asPercent ? value / 100 : value;
  if (rate >= MAX_FEE_RATE) {
    return { rate: fallback, note: `"${raw}" would be a ${rate * 100}% fee; using the default ${fallback}` };
  }
  return asPercent && !hasPercentSign
    ? { rate, note: `"${raw}" read as a percentage: ${value}% (${rate})` }
    : { rate };
}

/** parseFeeRate for one environment variable, logging any correction. */
export function feeRateFromEnv(name: string, fallback: number): number {
  const reading = parseFeeRate(process.env[name], fallback);
  if (reading.note) console.warn(`[config] ${name}: ${reading.note}`);
  return reading.rate;
}
