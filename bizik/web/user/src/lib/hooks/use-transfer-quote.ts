import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * What a top-up or withdrawal will actually cost.
 *
 * Asked of the server rather than worked out here, because the rail's cut is a
 * commercial term that changes without a deploy. A copy of the rate in the
 * client is a copy that goes stale silently: it would show one number and
 * charge another, and the user would only find out from their mobile money
 * balance.
 */
export interface TransferQuote {
  /** What the user asked for - credited to the wallet, or paid to their phone. */
  amount: number;
  /** The rail's cut, charged on top. */
  fee: number;
  /** What is actually collected from them, or debited from the wallet. */
  total: number;
  rate: number;
}

export function useTransferQuote(
  amount: number,
  direction: 'deposit' | 'withdrawal',
  currency: string,
  enabled = true,
) {
  return useQuery<TransferQuote>({
    queryKey: ['transfer-quote', direction, amount, currency],
    queryFn: async () => {
      const { data } = await api.get<TransferQuote>(endpoints.wallet.transferQuote, {
        params: { amount, direction, currency },
      });
      return data;
    },
    enabled: enabled && amount > 0,
    // The rate only changes when an operator changes it, so this does not need
    // refetching as somebody types; but it must not be cached so long that a
    // corrected rate keeps quoting the old one for the rest of the session.
    staleTime: 60_000,
    // A quote that fails must not leave a stale number on screen next to a
    // different charge - the caller renders the shortfall instead.
    retry: 1,
  });
}
