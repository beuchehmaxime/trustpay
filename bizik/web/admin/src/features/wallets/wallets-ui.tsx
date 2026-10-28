import { cn } from '@/lib/utils';
import { humanizeMethod } from '@/lib/method-format';
import { STATUS_TONE, type StatusTone } from '@/lib/status-tone';
import type { PayoutStatusValue, WalletStatusValue, WalletTxTypeValue } from './types';

const WALLET_TONES: Record<WalletStatusValue, StatusTone> = {
  ACTIVE: 'positive',
  FROZEN: 'negative',
  CLOSED: 'neutral',
};

export function WalletStatusBadge({ status }: { status: WalletStatusValue }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        STATUS_TONE[WALLET_TONES[status]],
      )}
    >
      {status.toLowerCase()}
    </span>
  );
}

const PAYOUT_TONES: Record<PayoutStatusValue, StatusTone> = {
  INITIATED: 'info',
  PROCESSING: 'info',
  ON_HOLD: 'warning',
  COMPLETED: 'positive',
  FAILED: 'negative',
};

const PAYOUT_LABEL: Record<PayoutStatusValue, string> = {
  INITIATED: 'Pending',
  PROCESSING: 'Processing',
  ON_HOLD: 'On hold',
  COMPLETED: 'Completed',
  FAILED: 'Failed',
};

export function PayoutStatusBadge({ status }: { status: PayoutStatusValue }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        STATUS_TONE[PAYOUT_TONES[status]],
      )}
    >
      {PAYOUT_LABEL[status]}
    </span>
  );
}

const WALLET_TX_TONES: Record<WalletTxTypeValue, StatusTone> = {
  DEPOSIT: 'positive',
  WITHDRAWAL: 'warning',
  ESCROW_HOLD: 'info',
  FEE: 'neutral',
  REFUND: 'info',
  FX_IN: 'purple',
  FX_OUT: 'purple',
  ADJUSTMENT: 'neutral',
};

const WALLET_TX_LABEL: Record<WalletTxTypeValue, string> = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  ESCROW_HOLD: 'Escrow hold',
  FEE: 'Fee',
  REFUND: 'Refund',
  FX_IN: 'FX in',
  FX_OUT: 'FX out',
  ADJUSTMENT: 'Adjustment',
};

export function WalletTxTypeBadge({ type }: { type: WalletTxTypeValue }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        STATUS_TONE[WALLET_TX_TONES[type]],
      )}
    >
      {WALLET_TX_LABEL[type]}
    </span>
  );
}

/** Format an amount with its ISO currency. */
export function money(amount: number, currency: string | null): string {
  if (!currency) return amount.toLocaleString();
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toLocaleString()} ${currency}`;
  }
}

/** Signed amount for the ledger: +credit / −debit. */
export function signedMoney(amount: number, currency: string | null): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${money(Math.abs(amount), currency)}`;
}

/** Friendly label for a payout method / provider code (never shows underscores). */
export function methodLabel(type: string): string {
  return humanizeMethod(type);
}
