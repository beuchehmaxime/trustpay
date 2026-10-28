import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { userApi } from '@/lib/api/user.api';

/** Debounce a fast-changing value (e.g. a phone field) by `delay` ms. */
export function useDebounced<Value>(value: Value, delay = 450): Value {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * Look up whether a phone number belongs to an existing BiZik account. Only
 * fires when `enabled` is true (caller validates the phone shape first).
 */
export function useUserLookup(params: { phone?: string; email?: string }, enabled: boolean) {
  return useQuery({
    queryKey: ['user-lookup', params.email ?? '', params.phone ?? ''],
    queryFn: () => userApi.lookup(params),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}
