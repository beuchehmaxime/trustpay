import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * The countries BiZik accepts, served from the platform's markets settings.
 *
 * Read from the server rather than hardcoded in the app: the list is an
 * operator setting, so a market that gets disabled has to disappear from the
 * picker at once instead of letting someone choose a country the backend will
 * then refuse. It is also the country NAME that gets stored, so the client must
 * offer exactly the spellings the backend recognises.
 */
export interface MarketCountry {
  /** Stored value, e.g. "Cameroon". */
  name: string;
  /** ISO 3166-1 alpha-2, or null for a market with no code mapped yet. */
  code: string | null;
  /** Flag emoji, derived from the code server-side. */
  flag: string;
  currency: string;
  locale: string;
}

export function useCountries() {
  return useQuery({
    queryKey: ['countries'],
    queryFn: async () => {
      const { data } = await api.get<MarketCountry[]>(endpoints.countries);
      return data;
    },
    // Markets change when an operator edits settings, which is rare.
    staleTime: 60 * 60 * 1000,
  });
}
