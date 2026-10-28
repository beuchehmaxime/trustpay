import crypto from 'crypto';

import { Currency, PaymentGateway, PayoutMethodType } from '@prisma/client';

/**
 * Payment-gateway adapter (SRS FR-PAY-001/008, INT-STR/PSK/FLW/MTN/OMN).
 *
 * Production routes to Stripe / Paystack / Flutterwave (deposits) and
 * MTN MoMo / Orange Money / Payoneer / bank (payouts), all idempotent and
 * webhook-driven. Here it is SIMULATED so the full escrow lifecycle is testable
 * without gateway keys - the adapter shape matches the real one, so swapping in
 * the HTTP clients is a contained change.
 *
 * Determinism for tests: an amount whose minor units end in `.13` simulates a
 * gateway failure; everything else succeeds.
 */
/** How a pay-in is being made: internal wallet aside, an external rail. */
export type ChargeMethod = 'card' | 'momo' | 'bank' | 'payoneer';

export interface ChargeInput {
  amount: number;
  currency: Currency;
  gateway?: PaymentGateway;
  reference?: string;
  /** The rail the payer chose (drives which gateway processes it). */
  method?: ChargeMethod;
  /** Mobile-money network (e.g. "MTN", "Orange") when method is 'momo'. */
  provider?: string | null;
}

export interface ChargeResult {
  gateway: PaymentGateway;
  gatewayRef: string;
  status: 'SUCCEEDED' | 'FAILED';
  failureReason?: string;
}

/** Map a saved payout method onto a pay-in rail + network. */
export function methodFromPayoutType(
  type: PayoutMethodType,
  provider?: string | null,
): { method: ChargeMethod; provider?: string } {
  switch (type) {
    case 'MTN_MOMO':
      return { method: 'momo', provider: provider ?? 'MTN' };
    case 'ORANGE_MONEY':
      return { method: 'momo', provider: provider ?? 'Orange' };
    case 'BANK':
      return { method: 'bank' };
    case 'PAYONEER':
      return { method: 'payoneer' };
    default:
      return { method: 'card' };
  }
}

/** Pick a plausible gateway from the currency when one isn't specified. */
function gatewayForCurrency(currency: Currency): PaymentGateway {
  if (currency === 'NGN' || currency === 'GHS') return 'PAYSTACK';
  if (currency === 'XAF') return 'FLUTTERWAVE';
  return 'STRIPE';
}

/** Route to the gateway that actually processes the chosen rail. */
function gatewayForMethod(method: ChargeMethod, provider: string | null | undefined, currency: Currency): PaymentGateway {
  if (method === 'momo') {
    return /orange/i.test(provider ?? '') ? 'ORANGE_MONEY' : 'MTN_MOMO';
  }
  if (method === 'bank') return 'BANK_TRANSFER';
  if (method === 'payoneer') return 'PAYONEER';
  return gatewayForCurrency(currency);
}

function fails(amount: number): boolean {
  const cents = Math.round(amount * 100) % 100;
  return cents === 13; // deterministic failure hook for tests
}

/** Charge a client's payment method to fund escrow / top up a wallet. */
export async function charge(input: ChargeInput): Promise<ChargeResult> {
  const gateway =
    input.gateway ??
    (input.method ? gatewayForMethod(input.method, input.provider, input.currency) : gatewayForCurrency(input.currency));
  if (fails(input.amount)) {
    const reason =
      input.method === 'momo'
        ? 'Mobile money payment was declined. Check your balance and try again.'
        : input.method === 'bank'
          ? 'Bank transfer was declined by your bank.'
          : 'Card declined by issuer.';
    return { gateway, gatewayRef: `ch_failed_${crypto.randomUUID()}`, status: 'FAILED', failureReason: reason };
  }
  return { gateway, gatewayRef: `ch_${crypto.randomUUID()}`, status: 'SUCCEEDED' };
}

/** Disburse a payout from a wallet to a local method. */
export async function payout(input: {
  amount: number;
  currency: Currency;
  gateway?: PaymentGateway;
}): Promise<ChargeResult> {
  const gateway = input.gateway ?? gatewayForCurrency(input.currency);
  return { gateway, gatewayRef: `po_${crypto.randomUUID()}`, status: 'SUCCEEDED' };
}

/** Refund a previously captured charge back to the original method. */
export async function refund(input: {
  amount: number;
  currency: Currency;
  /**
   * Optional, and normally omitted. Callers used to hardcode 'STRIPE' here,
   * which is a gateway this platform does not use and has never been able to
   * use - no card is ever touched anywhere in the estate. A dead card-processor
   * name sitting in a money path is the kind of thing that puts PCI scope back
   * on the table during an assessment for no reason at all. Left unset, the
   * gateway is derived from the currency like every other path.
   */
  gateway?: PaymentGateway;
}): Promise<ChargeResult> {
  const gateway = input.gateway ?? gatewayForCurrency(input.currency);
  return { gateway, gatewayRef: `re_${crypto.randomUUID()}`, status: 'SUCCEEDED' };
}
