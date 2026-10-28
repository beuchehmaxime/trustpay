import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * Wallet-to-wallet money between BiZik users, addressed by handle (@maxime.b)
 * or phone number. Direct and final - escrow is the protected alternative.
 */

export interface MyHandle {
  username: string;
  fullName: string;
}

/** A lookup deliberately returns a NAME only - never someone's phone/email. */
export type RecipientLookup =
  | { found: true; fullName: string; username: string | null }
  | { found: false; self?: boolean };

export interface SendMoneyInput {
  to: string;
  amount: number;
  currency: string;
  note?: string;
  idempotencyKey?: string;
}

export interface SendMoneyResult {
  id: string;
  amount: number;
  currency: string;
  note: string | null;
  reference: string | null;
  recipient: { fullName: string; username: string | null; label: string };
  balanceAfter: number;
  createdAt: string;
}

export interface TransferRecord {
  id: string;
  direction: 'in' | 'out';
  amount: number;
  currency: string;
  note: string | null;
  reference: string | null;
  counterparty: { fullName: string; username: string | null; label: string };
  createdAt: string;
}

export const transferApi = {
  async me() {
    const { data } = await api.get<MyHandle>(endpoints.transfer.me);
    return data;
  },
  async claimHandle(username: string) {
    const { data } = await api.patch<{ username: string }>(endpoints.transfer.handle, { username });
    return data;
  },
  async lookup(handle: string) {
    const { data } = await api.get<RecipientLookup>(endpoints.transfer.lookup, {
      params: { handle },
    });
    return data;
  },
  async send(input: SendMoneyInput) {
    const { data } = await api.post<SendMoneyResult>(endpoints.transfer.list, input);
    return data;
  },
  async list() {
    const { data } = await api.get<TransferRecord[]>(endpoints.transfer.list);
    return data;
  },
};
