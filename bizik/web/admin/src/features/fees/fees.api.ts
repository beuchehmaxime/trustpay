import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type { FeeUpdateInput, FeesConfig } from './types';

/** Admin Fees & FX pricing calls. */
export const feesApi = {
  async config() {
    const { data } = await api.get<FeesConfig>(endpoints.admin.feesConfig);
    return data;
  },
  async updateFees(input: FeeUpdateInput) {
    const { data } = await api.put<FeesConfig>(endpoints.admin.feesUpdate, input);
    return data;
  },
  async updateFxRate(currency: string, usdRate: number) {
    const { data } = await api.put<FeesConfig>(endpoints.admin.fxRateUpdate(currency), { usdRate });
    return data;
  },
};
