/**
 * Representative wallet data from the design handoff (§4, persona: Ada Okafor).
 * Swap for live wallet/FX/transactions hooks when those APIs are wired.
 */

export const walletSummary = {
  homeCurrency: 'NGN',
  available: 4_820_500,
  availableUsd: 3_120.45,
  inEscrow: 1_950_000,
  payoutProcessing: 120_000,
  completed: 8_400_000,
} as const;

export interface Holding {
  code: string;
  name: string;
  region: string; // 2-letter code shown in the tile (emoji flags don't render on Windows)
  balance: number;
  changePct: number;
  /** 30-day mini trend for the row sparkline. */
  spark: number[];
}

export const holdings: Holding[] = [
  { code: 'NGN', name: 'Nigerian Naira', region: 'NG', balance: 4_820_500, changePct: 1.2, spark: [10, 12, 11, 13, 12, 14, 13, 15] },
  { code: 'USD', name: 'US Dollar', region: 'US', balance: 860, changePct: -0.4, spark: [15, 14, 15, 13, 14, 12, 13, 11] },
  { code: 'GHS', name: 'Ghanaian Cedi', region: 'GH', balance: 1_240, changePct: 0.3, spark: [10, 11, 10, 12, 11, 12, 13, 14] },
];

/** Reference FX rate: units of each currency per 1 USD. Swap for a live rates feed. */
export const fxPerUsd: Record<string, number> = {
  USD: 1,
  NGN: 1_545,
  GHS: 15.2,
  EUR: 0.92,
  GBP: 0.79,
  XAF: 606,
};

export interface ConvertCurrency {
  code: string;
  region: string; // 2-letter code shown in the chip (flags don't render on Windows)
}

/** Currencies offered in the Convert (FX) picker, in display order. */
export const convertCurrencies: ConvertCurrency[] = [
  { code: 'NGN', region: 'NG' },
  { code: 'USD', region: 'US' },
  { code: 'GBP', region: 'GB' },
  { code: 'EUR', region: 'EU' },
  { code: 'GHS', region: 'GH' },
  { code: 'XAF', region: 'CM' },
];

export type PayoutKind = 'momo' | 'bank' | 'payoneer';

export interface PayoutMethod {
  id: string;
  kind: PayoutKind;
  name: string;
  masked: string;
  /** Extra sub-line detail (e.g. "Default", branch city). */
  sublabel?: string;
  badge: 'default' | 'verified' | 'pending';
}

export const payoutMethods: PayoutMethod[] = [
  { id: 'p1', kind: 'momo', name: 'MTN Mobile Money', masked: '•••• 5566', sublabel: 'Default', badge: 'verified' },
  { id: 'p2', kind: 'bank', name: 'GTBank', masked: '•••• 0142', sublabel: 'Lagos', badge: 'verified' },
];

export type TxType = 'release' | 'topup' | 'withdrawal' | 'fee' | 'fx';

export interface WalletTx {
  id: string;
  type: TxType;
  time: string;
  deal?: string;
  amount: number; // signed: negative = out
  currency: string;
  status: 'completed' | 'processing';
}

export const walletTransactions: WalletTx[] = [
  {
    id: 't1',
    type: 'release',
    time: '5 Aug · 09:12',
    deal: 'Brand identity',
    amount: -300_000,
    currency: 'NGN',
    status: 'completed',
  },
  {
    id: 't2',
    type: 'topup',
    time: '4 Aug · 18:40',
    amount: 250_000,
    currency: 'NGN',
    status: 'completed',
  },
  {
    id: 't3',
    type: 'withdrawal',
    time: '3 Aug · 11:05',
    deal: 'MTN Mobile Money',
    amount: -100_000,
    currency: 'NGN',
    status: 'processing',
  },
  {
    id: 't4',
    type: 'fee',
    time: '2 Aug · 14:22',
    amount: -7_500,
    currency: 'NGN',
    status: 'completed',
  },
  {
    id: 't5',
    type: 'fx',
    time: '1 Aug · 08:15',
    deal: 'USD → NGN',
    amount: -400_000,
    currency: 'NGN',
    status: 'completed',
  },
];

/** Escrow-flow bars - held vs released per month (handoff palette). */
export const escrowFlow = [
  { label: 'Mar', funded: 900_000, released: 420_000 },
  { label: 'Apr', funded: 1_250_000, released: 780_000 },
  { label: 'May', funded: 1_400_000, released: 900_000 },
  { label: 'Jun', funded: 1_150_000, released: 1_120_000 },
  { label: 'Jul', funded: 1_750_000, released: 820_000 },
  { label: 'Aug', funded: 1_950_000, released: 1_300_000 },
];
