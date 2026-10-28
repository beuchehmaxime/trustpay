import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { transferApi } from '@/lib/api/transfer.api';

/** The user's own handle, for the "receive money" side. */
export function useMyHandle() {
  return useQuery({ queryKey: ['transfer', 'me'], queryFn: transferApi.me });
}

export function useTransfers() {
  return useQuery({ queryKey: ['transfer', 'list'], queryFn: transferApi.list });
}

/** Settle on a value only after the user stops typing. */
function useDebounced<T>(value: T, delay = 400): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

/**
 * Resolve a handle as the user types, so the recipient's real NAME is on screen
 * before they can send anything - a transfer is final, and a mistyped handle is
 * the one mistake that cannot be undone.
 */
export function useRecipientLookup(query: string) {
  const settled = query.trim();
  const debounced = useDebounced(settled);
  const typing = debounced !== settled;

  const lookup = useQuery({
    queryKey: ['transfer', 'lookup', debounced],
    queryFn: () => transferApi.lookup(debounced),
    enabled: debounced.length >= 3,
    staleTime: 30_000,
    retry: false,
  });

  return {
    result: debounced.length >= 3 && !typing ? (lookup.data ?? null) : null,
    checking: settled.length >= 3 && (typing || lookup.isFetching),
  };
}

export function useSendMoney() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: transferApi.send,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['wallet'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transfer', 'list'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
