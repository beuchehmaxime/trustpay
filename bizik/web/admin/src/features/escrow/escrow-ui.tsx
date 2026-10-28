import { cn } from '@/lib/utils';
import { STATUS_TONE, type StatusTone } from '@/lib/status-tone';
import type { EscrowAccountStatusValue, EscrowTxTypeValue, TxStatusValue } from './types';

const ACCOUNT_STATUS_TONES: Record<EscrowAccountStatusValue, StatusTone> = {
  OPEN: 'info',
  PARTIALLY_RELEASED: 'warning',
  RELEASED: 'positive',
  REFUNDED: 'neutral',
  FROZEN: 'negative',
  CLOSED: 'neutral',
};

const ACCOUNT_STATUS_LABEL: Record<EscrowAccountStatusValue, string> = {
  OPEN: 'Open',
  PARTIALLY_RELEASED: 'Partial',
  RELEASED: 'Released',
  REFUNDED: 'Refunded',
  FROZEN: 'Frozen',
  CLOSED: 'Closed',
};

export function AccountStatusBadge({ status }: { status: EscrowAccountStatusValue }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        STATUS_TONE[ACCOUNT_STATUS_TONES[status]],
      )}
    >
      {ACCOUNT_STATUS_LABEL[status]}
    </span>
  );
}

const TX_TYPE_TONES: Record<EscrowTxTypeValue, StatusTone> = {
  FUND: 'info',
  HOLD: 'info',
  RELEASE: 'positive',
  REFUND: 'warning',
  ADJUSTMENT: 'purple',
};

export function TxTypeBadge({ type }: { type: EscrowTxTypeValue }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        STATUS_TONE[TX_TYPE_TONES[type]],
      )}
    >
      {type.toLowerCase()}
    </span>
  );
}

const TX_STATUS_STYLE: Record<TxStatusValue, string> = {
  PENDING: 'text-amber-600',
  PROCESSING: 'text-amber-600',
  COMPLETED: 'text-positive',
  FAILED: 'text-negative',
  REVERSED: 'text-muted-foreground',
};

export function TxStatusText({ status }: { status: TxStatusValue }) {
  return (
    <span className={cn('text-xs font-medium', TX_STATUS_STYLE[status])}>
      {status.charAt(0) + status.slice(1).toLowerCase()}
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

/** Signed amount for the ledger - release/adjustment can be positive/negative. */
export function signedMoney(amount: number, currency: string | null): string {
  const sign = amount > 0 ? '+' : amount < 0 ? '−' : '';
  return `${sign}${money(Math.abs(amount), currency)}`;
}
