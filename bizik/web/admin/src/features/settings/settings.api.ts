import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  GeneralSettings,
  LegalDocType,
  LegalDocument,
  LegalUpdateInput,
  MarketsSettings,
  ProvidersSettings,
  SettingsGroup,
  SettingsOverview,
  VerificationSettings,
} from './types';

type GroupPayload = {
  general: GeneralSettings;
  markets: MarketsSettings;
  verification: VerificationSettings;
  providers: ProvidersSettings;
};

/** Admin system-settings calls (SRS FR-ADM-009). */
export const settingsApi = {
  async overview() {
    const { data } = await api.get<SettingsOverview>(endpoints.admin.settings);
    return data;
  },
  async updateGroup<Group extends SettingsGroup>(group: Group, value: GroupPayload[Group]) {
    const { data } = await api.put<SettingsOverview>(endpoints.admin.settingsGroup(group), value);
    return data;
  },
  async updateLegal(type: LegalDocType, input: LegalUpdateInput) {
    const { data } = await api.put<LegalDocument>(endpoints.admin.settingsLegal(type), input);
    return data;
  },
};
