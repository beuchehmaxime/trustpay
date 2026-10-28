import {
  AlertCircle,
  ArrowDown,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Lock,
  type LucideIcon,
} from 'lucide-react';

import type { Transaction, TxKind, TxStatus } from '@/lib/demo/transactions';
import { formatMoney } from '@/lib/format';

/** Icon-tile background/foreground per tone. */
export const TX_TILE: Record<string, string> = {
  positive: 'bg-positive-bg text-positive-text',
  brand: 'bg-brand-50 text-brand-600',
  warning: 'bg-warning-bg text-warning-text',
  neutral: 'bg-muted text-muted-foreground',
  negative: 'bg-negative-bg text-negative',
};

export const TX_KIND_META: Record<TxKind, { icon: LucideIcon; tone: keyof typeof TX_TILE }> = {
  escrowReleased: { icon: ArrowUpRight, tone: 'positive' },
  walletTopup: { icon: ArrowDownLeft, tone: 'brand' },
  withdraw: { icon: ArrowDown, tone: 'warning' },
  escrowFunded: { icon: Lock, tone: 'brand' },
  currencyConversion: { icon: ArrowLeftRight, tone: 'neutral' },
  escrowHeldDispute: { icon: AlertCircle, tone: 'negative' },
};

export const TX_STATUS_TONE: Record<TxStatus, 'positive' | 'warning' | 'negative'> = {
  completed: 'positive',
  pending: 'warning',
  processing: 'warning',
  failed: 'negative',
  disputed: 'negative',
};

/** Signed, colour-coded amount label for a transaction. */
export function txAmount(transaction: Transaction): { text: string; className: string } {
  const money = formatMoney(transaction.amount, transaction.currency);
  if (transaction.direction === 'in') return { text: `+ ${money}`, className: 'text-[#16a34a]' };
  if (transaction.direction === 'out') return { text: `− ${money}`, className: 'text-[#f43f5e]' };
  return { text: money, className: 'text-ink' };
}
