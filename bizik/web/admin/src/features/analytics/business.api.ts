import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  CostCategory,
  FinancialAnalytics,
  OperatingCost,
  ProductAnalytics,
} from './business.types';

export const businessAnalyticsApi = {
  async product(days = 30) {
    const { data } = await api.get<ProductAnalytics>(endpoints.admin.analyticsProduct, {
      params: { days },
    });
    return data;
  },
  async financial(month?: string) {
    const { data } = await api.get<FinancialAnalytics>(endpoints.admin.analyticsFinancial, {
      params: month ? { month } : undefined,
    });
    return data;
  },
  async costs() {
    const { data } = await api.get<OperatingCost[]>(endpoints.admin.analyticsCosts);
    return data;
  },
  async saveCost(input: {
    month: string;
    category: CostCategory;
    amountXaf: number;
    note?: string;
  }) {
    const { data } = await api.post(endpoints.admin.analyticsCosts, input);
    return data;
  },
  async deleteCost(id: string) {
    const { data } = await api.delete(endpoints.admin.analyticsCost(id));
    return data;
  },
};
