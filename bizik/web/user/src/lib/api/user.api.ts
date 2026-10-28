import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * User directory lookup - resolves a phone/email to an existing BiZik account
 * so the New Deal flow can auto-fill (and lock) the counterparty name. Mirrors
 * the mobile app's `userApi.lookup` (`application/mobile/src/features/user`).
 * Only the name is ever exposed; `self` flags the caller's own number.
 */

export interface LookupResult {
  found: boolean;
  fullName?: string;
  self?: boolean;
}

export const userApi = {
  async lookup(params: { phone?: string; email?: string }) {
    const { data } = await api.get<LookupResult>(endpoints.user.lookup, { params });
    return data;
  },
};
