import { feeSettings } from './settings';

/** Round to 2 decimal places (money). Decimal(20,4) columns store it fine. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Client service fee charged on top of a milestone at funding (FR-PAY-010). */
export function clientServiceFee(amount: number): number {
  return round2(amount * feeSettings().clientServicePct);
}

/** Freelancer fee deducted from a milestone at release (FR-PAY-010). */
export function freelancerFee(amount: number): number {
  return round2(amount * feeSettings().freelancerFeePct);
}

/** Net amount credited to the payee's wallet after the freelancer fee. */
export function releaseNet(amount: number): number {
  return round2(amount - freelancerFee(amount));
}

/** Express (accelerated) withdrawal fee. */
export function expressWithdrawalFee(amount: number): number {
  return round2(amount * feeSettings().expressWithdrawalPct);
}

/** Full fee breakdown for a milestone, for display before funding/release. */
export function feeBreakdown(amount: number) {
  return {
    amount: round2(amount),
    clientFee: clientServiceFee(amount),
    fundingTotal: round2(amount + clientServiceFee(amount)),
    freelancerFee: freelancerFee(amount),
    releaseNet: releaseNet(amount),
  };
}
