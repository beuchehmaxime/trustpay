/** Escrow & transactions types - mirrors backend EscrowAdminService (SRS MOD-07). */

export type EscrowAccountStatusValue =
  | 'OPEN'
  | 'PARTIALLY_RELEASED'
  | 'RELEASED'
  | 'REFUNDED'
  | 'FROZEN'
  | 'CLOSED';

export type EscrowTxTypeValue = 'FUND' | 'HOLD' | 'RELEASE' | 'REFUND' | 'ADJUSTMENT';
export type TxStatusValue = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'REVERSED';

export interface EscrowAccountRow {
  id: string;
  contractId: string;
  subAccountRef: string;
  contractTitle: string;
  contractStatus: string | null;
  counterparty: string | null;
  currency: string;
  held: number;
  released: number;
  refunded: number;
  status: EscrowAccountStatusValue;
  transactionCount: number;
  refundCount: number;
  updatedAt: string;
}

export interface LedgerTransaction {
  id: string;
  reference: string;
  escrowAccountId: string;
  contractId: string | null;
  milestoneId: string | null;
  type: EscrowTxTypeValue;
  amount: number;
  currency: string;
  status: TxStatusValue;
  gateway: string | null;
  gatewayRef: string | null;
  note: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface EscrowMilestone {
  id: string;
  order: number;
  title: string;
  amount: number;
  currency: string;
  status: string;
  held: boolean;
}

export interface Reconciliation {
  expectedHeld: number;
  actualHeld: number;
  difference: number;
  balanced: boolean;
}

export interface EscrowRefund {
  id: string;
  amount: number;
  currency: string;
  reasonCode: string;
  status: string;
  createdAt: string;
}

export interface EscrowFee {
  id: string;
  type: string;
  amount: number;
  currency: string;
  createdAt: string;
}

export interface EscrowAccountDetail {
  id: string;
  reference: string;
  contractId: string;
  subAccountRef: string;
  currency: string;
  held: number;
  released: number;
  refunded: number;
  status: EscrowAccountStatusValue;
  createdAt: string;
  updatedAt: string;
  contractTitle: string | null;
  payerName: string | null;
  payeeName: string | null;
  contract: { id: string; title: string; status: string } | null;
  reconciliation: Reconciliation;
  milestones: EscrowMilestone[];
  transactions: LedgerTransaction[];
  refunds: EscrowRefund[];
  fees: EscrowFee[];
}

export interface EscrowTransactionDetail extends LedgerTransaction {
  account: {
    id: string;
    subAccountRef: string;
    currency: string;
    status: EscrowAccountStatusValue;
    held: number;
    released: number;
  } | null;
  contract: { id: string; title: string; status: string } | null;
  payerName: string | null;
  payeeName: string | null;
  milestone: {
    id: string;
    order: number;
    title: string;
    amount: number;
    currency: string;
    status: string;
  } | null;
}

export interface CurrencyAggregate {
  currency: string;
  held: number;
  released: number;
  refunded: number;
  accounts: number;
}

export interface EscrowStats {
  totalAccounts: number;
  open: number;
  partiallyReleased: number;
  released: number;
  refunded: number;
  frozen: number;
  byCurrency: CurrencyAggregate[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface AccountFilters {
  status?: EscrowAccountStatusValue;
  currency?: string;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface LedgerFilters {
  type?: EscrowTxTypeValue;
  status?: TxStatusValue;
  currency?: string;
  page?: number;
  pageSize?: number;
}
