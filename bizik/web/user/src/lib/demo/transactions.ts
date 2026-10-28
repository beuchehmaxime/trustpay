/**
 * Representative transaction ledger for the Transactions page + detail drawer
 * (persona: Ada Okafor). Every row carries the extra narrative the drawer needs
 * (about, counterparty, routing). Swap for a live transactions/ledger hook when
 * that API is wired.
 */

export type TxCategory = 'escrow' | 'topup' | 'payout' | 'fx';
export type TxDirection = 'in' | 'out' | 'neutral';
export type TxStatus = 'completed' | 'pending' | 'processing' | 'failed' | 'disputed';

/** Drives the row title (i18n key), icon and tone. */
export type TxKind =
  | 'escrowReleased'
  | 'walletTopup'
  | 'withdraw'
  | 'escrowFunded'
  | 'currencyConversion'
  | 'escrowHeldDispute';

export interface TxDetail {
  about: string;
  approx?: string;
  counterparty?: string;
  takenFrom?: string;
  paidInto?: string;
  /** Breakdown overrides (used when the display currency differs, e.g. FX). */
  grossOverride?: number;
  grossCurrency?: string;
  feeOverride?: number;
  feeCurrency?: string;
  netOverride?: number;
  netCurrency?: string;
}

export interface Transaction {
  id: string;
  ref: string;
  kind: TxKind;
  category: TxCategory;
  direction: TxDirection;
  amount: number;
  currency: string;
  fee: number;
  method: string;
  /** Optional { dest } param interpolated into the row title (e.g. Withdraw · GTBank). */
  titleParams?: Record<string, string>;
  dealLabel?: string;
  dealName?: string;
  status: TxStatus;
  dateLabel: string;
  today?: boolean;
  time: string;
  detail: TxDetail;
}

const PAYER = 'Ada Okafor · +234 803 441 9902';

export const transactions: Transaction[] = [
  {
    id: 't1',
    ref: 'TXN-90412',
    kind: 'escrowReleased',
    category: 'escrow',
    direction: 'out',
    amount: 300_000,
    currency: 'NGN',
    fee: 0,
    method: 'Escrow',
    dealLabel: 'Brand identity · M2',
    dealName: 'Brand identity & packaging',
    status: 'completed',
    dateLabel: '5 Aug 2026',
    today: true,
    time: '09:12',
    detail: {
      about:
        'Milestone 2 - Logotype & colour of “Brand identity & packaging”. You approved the delivery, so BiZik released the held funds to Kwame Mensah.',
      approx: '≈ GHS 2,460.00',
      counterparty: 'Kwame Mensah · Accra, GH',
      takenFrom: 'Escrow · Brand identity & packaging',
      paidInto: 'Kwame’s GHS payout account',
    },
  },
  {
    id: 't2',
    ref: 'TXN-90408',
    kind: 'walletTopup',
    category: 'topup',
    direction: 'in',
    amount: 250_000,
    currency: 'NGN',
    fee: 0,
    method: 'MTN •••• 5566',
    status: 'completed',
    dateLabel: '5 Aug 2026',
    today: true,
    time: '08:41',
    detail: {
      about: 'You topped up your Naira wallet from MTN Mobile Money so escrow could be funded instantly.',
      counterparty: 'MTN Mobile Money •••• 5566',
      takenFrom: 'MTN Mobile Money •••• 5566',
      paidInto: 'NGN wallet',
    },
  },
  {
    id: 't3',
    ref: 'TXN-90391',
    kind: 'withdraw',
    category: 'payout',
    direction: 'out',
    amount: 120_000,
    currency: 'NGN',
    fee: 2_500,
    method: 'GTBank •••• 0142',
    titleParams: { dest: 'GTBank' },
    status: 'pending',
    dateLabel: '4 Aug 2026',
    time: '18:02',
    detail: {
      about: 'A withdrawal to your GTBank account. It is being processed and usually settles within 1-2 business days.',
      takenFrom: 'NGN wallet',
      paidInto: 'GTBank •••• 0142',
    },
  },
  {
    id: 't4',
    ref: 'TXN-90384',
    kind: 'escrowFunded',
    category: 'escrow',
    direction: 'in',
    amount: 180_000,
    currency: 'NGN',
    fee: 0,
    method: 'Escrow',
    dealLabel: 'Office fit-out',
    dealName: 'Office fit-out photography',
    status: 'completed',
    dateLabel: '4 Aug 2026',
    time: '16:20',
    detail: {
      about: 'Amina Bello funded escrow for “Office fit-out photography”. The money is protected until you deliver and it is approved.',
      counterparty: 'Amina Bello · Lagos, NG',
      takenFrom: 'Amina’s NGN wallet',
      paidInto: 'Escrow · Office fit-out photography',
    },
  },
  {
    id: 't5',
    ref: 'TXN-90377',
    kind: 'currencyConversion',
    category: 'fx',
    direction: 'neutral',
    amount: 647.25,
    currency: 'USD',
    fee: 0,
    method: 'NGN → USD',
    status: 'completed',
    dateLabel: '4 Aug 2026',
    time: '11:03',
    detail: {
      about: 'You converted Naira to US Dollars at a locked rate of 1 USD = ₦1,545.00.',
      approx: '≈ ₦1,000,000.00',
      takenFrom: 'NGN wallet',
      paidInto: 'USD wallet',
      grossOverride: 1_000_000,
      grossCurrency: 'NGN',
      feeOverride: 5_000,
      feeCurrency: 'NGN',
      netOverride: 647.25,
      netCurrency: 'USD',
    },
  },
  {
    id: 't6',
    ref: 'TXN-90362',
    kind: 'escrowHeldDispute',
    category: 'escrow',
    direction: 'neutral',
    amount: 300_000,
    currency: 'NGN',
    fee: 0,
    method: 'Escrow',
    dealLabel: 'Brand identity · M3',
    dealName: 'Brand identity & packaging',
    status: 'disputed',
    dateLabel: '4 Aug 2026',
    time: '09:40',
    detail: {
      about: 'Milestone 3 is under dispute. The funds stay safely held in escrow until a BiZik mediator resolves it.',
      counterparty: 'Kwame Mensah · Accra, GH',
      takenFrom: 'Your NGN wallet',
      paidInto: 'Escrow · Brand identity & packaging',
    },
  },
  {
    id: 't7',
    ref: 'TXN-90355',
    kind: 'walletTopup',
    category: 'topup',
    direction: 'in',
    amount: 600_000,
    currency: 'NGN',
    fee: 0,
    method: 'GTBank •••• 0142',
    status: 'completed',
    dateLabel: '2 Aug 2026',
    time: '14:09',
    detail: {
      about: 'Bank transfer top-up from GTBank into your Naira wallet.',
      counterparty: 'GTBank •••• 0142',
      takenFrom: 'GTBank •••• 0142',
      paidInto: 'NGN wallet',
    },
  },
  {
    id: 't8',
    ref: 'TXN-90340',
    kind: 'escrowReleased',
    category: 'escrow',
    direction: 'out',
    amount: 180_000,
    currency: 'NGN',
    fee: 0,
    method: 'Escrow',
    dealLabel: 'Logo refresh · M1',
    dealName: 'Logo refresh',
    status: 'completed',
    dateLabel: '2 Aug 2026',
    time: '10:22',
    detail: {
      about: 'You approved milestone 1 of “Logo refresh”, releasing the held funds to the freelancer.',
      counterparty: 'Chidi Okonkwo · Abuja, NG',
      takenFrom: 'Escrow · Logo refresh',
      paidInto: 'Chidi’s NGN payout account',
    },
  },
  {
    id: 't9',
    ref: 'TXN-90322',
    kind: 'withdraw',
    category: 'payout',
    direction: 'out',
    amount: 90_000,
    currency: 'NGN',
    fee: 1_000,
    method: 'MTN •••• 5566',
    titleParams: { dest: 'MTN' },
    status: 'completed',
    dateLabel: '1 Aug 2026',
    time: '19:33',
    detail: {
      about: 'An instant withdrawal to your MTN Mobile Money wallet.',
      takenFrom: 'NGN wallet',
      paidInto: 'MTN Mobile Money •••• 5566',
    },
  },
  {
    id: 't10',
    ref: 'TXN-90310',
    kind: 'escrowFunded',
    category: 'escrow',
    direction: 'in',
    amount: 480_000,
    currency: 'NGN',
    fee: 0,
    method: 'Escrow',
    dealLabel: 'Website build · M1',
    dealName: 'Website build',
    status: 'completed',
    dateLabel: '1 Aug 2026',
    time: '09:15',
    detail: {
      about: 'Escrow funded for milestone 1 of “Website build”. Funds are protected until the milestone is approved.',
      counterparty: 'Zainab Yusuf · Kano, NG',
      takenFrom: 'Zainab’s NGN wallet',
      paidInto: 'Escrow · Website build',
    },
  },
  {
    id: 't11',
    ref: 'TXN-90298',
    kind: 'currencyConversion',
    category: 'fx',
    direction: 'neutral',
    amount: 1_300,
    currency: 'USD',
    fee: 0,
    method: 'NGN → USD',
    status: 'completed',
    dateLabel: '31 Jul 2026',
    time: '16:40',
    detail: {
      about: 'You converted Naira to US Dollars at a locked rate of 1 USD = ₦1,545.00.',
      approx: '≈ ₦2,008,500.00',
      takenFrom: 'NGN wallet',
      paidInto: 'USD wallet',
      grossOverride: 2_008_500,
      grossCurrency: 'NGN',
      feeOverride: 10_042,
      feeCurrency: 'NGN',
      netOverride: 1_300,
      netCurrency: 'USD',
    },
  },
  {
    id: 't12',
    ref: 'TXN-90284',
    kind: 'escrowReleased',
    category: 'escrow',
    direction: 'out',
    amount: 220_000,
    currency: 'NGN',
    fee: 0,
    method: 'Escrow',
    dealLabel: 'Packaging design · M2',
    dealName: 'Packaging design',
    status: 'completed',
    dateLabel: '31 Jul 2026',
    time: '12:05',
    detail: {
      about: 'Milestone 2 of “Packaging design” approved and released to the freelancer.',
      counterparty: 'Fatima Sani · Ibadan, NG',
      takenFrom: 'Escrow · Packaging design',
      paidInto: 'Fatima’s NGN payout account',
    },
  },
  {
    id: 't13',
    ref: 'TXN-90270',
    kind: 'walletTopup',
    category: 'topup',
    direction: 'in',
    amount: 150_000,
    currency: 'NGN',
    fee: 0,
    method: 'MTN •••• 5566',
    status: 'completed',
    dateLabel: '30 Jul 2026',
    time: '08:20',
    detail: {
      about: 'Mobile-money top-up from MTN into your Naira wallet.',
      counterparty: 'MTN Mobile Money •••• 5566',
      takenFrom: 'MTN Mobile Money •••• 5566',
      paidInto: 'NGN wallet',
    },
  },
  {
    id: 't14',
    ref: 'TXN-90255',
    kind: 'withdraw',
    category: 'payout',
    direction: 'out',
    amount: 300_000,
    currency: 'NGN',
    fee: 2_500,
    method: 'GTBank •••• 0142',
    titleParams: { dest: 'GTBank' },
    status: 'completed',
    dateLabel: '29 Jul 2026',
    time: '15:48',
    detail: {
      about: 'A bank withdrawal to your GTBank account.',
      takenFrom: 'NGN wallet',
      paidInto: 'GTBank •••• 0142',
    },
  },
  {
    id: 't15',
    ref: 'TXN-90240',
    kind: 'escrowFunded',
    category: 'escrow',
    direction: 'in',
    amount: 95_000,
    currency: 'NGN',
    fee: 0,
    method: 'Escrow',
    dealLabel: 'Product photos · M1',
    dealName: 'Product photos',
    status: 'completed',
    dateLabel: '29 Jul 2026',
    time: '10:10',
    detail: {
      about: 'Escrow funded for milestone 1 of “Product photos”.',
      counterparty: 'Emeka Obi · Enugu, NG',
      takenFrom: 'Emeka’s NGN wallet',
      paidInto: 'Escrow · Product photos',
    },
  },
  {
    id: 't16',
    ref: 'TXN-90228',
    kind: 'currencyConversion',
    category: 'fx',
    direction: 'neutral',
    amount: 500,
    currency: 'USD',
    fee: 0,
    method: 'NGN → USD',
    status: 'completed',
    dateLabel: '28 Jul 2026',
    time: '09:00',
    detail: {
      about: 'You converted Naira to US Dollars at a locked rate of 1 USD = ₦1,545.00.',
      approx: '≈ ₦772,500.00',
      takenFrom: 'NGN wallet',
      paidInto: 'USD wallet',
      grossOverride: 772_500,
      grossCurrency: 'NGN',
      feeOverride: 3_862,
      feeCurrency: 'NGN',
      netOverride: 500,
      netCurrency: 'USD',
    },
  },
];

export const transactionsPeriodLabel = '1-5 Aug 2026';
export const transactionPayer = PAYER;

/** Period KPIs, computed from the ledger so the tiles stay consistent. */
export const transactionsSummary = {
  currency: 'NGN',
  moneyIn: transactions
    .filter((item) => item.direction === 'in' && item.currency === 'NGN')
    .reduce((sum, item) => sum + item.amount, 0),
  moneyOut: transactions
    .filter((item) => item.direction === 'out' && item.currency === 'NGN')
    .reduce((sum, item) => sum + item.amount, 0),
  feesPaid: transactions.reduce((sum, item) => sum + item.fee, 0),
  count: transactions.length,
};
