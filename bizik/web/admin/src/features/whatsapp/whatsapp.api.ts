import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import type {
  Campaign,
  CampaignDetail,
  CampaignPreview,
  CampaignSegment,
  SendCampaignPayload,
  WhatsAppConversationFilter,
  WhatsAppConversationPage,
  WhatsAppMessageRow,
  WhatsAppOverview,
  WhatsAppThread,
} from './types';

/** Operator view of the WhatsApp assistant, plus its kill switch. */
export const adminWhatsAppApi = {
  async overview(days = 14) {
    const { data } = await api.get<WhatsAppOverview>(endpoints.admin.whatsappOverview, {
      params: { days },
    });
    return data;
  },
  async messages(limit = 50) {
    const { data } = await api.get<WhatsAppMessageRow[]>(endpoints.admin.whatsappMessages, {
      params: { limit },
    });
    return data;
  },
  /** Conversations, one row per contact. */
  async conversations(params: {
    search?: string;
    filter?: WhatsAppConversationFilter;
    limit?: number;
    offset?: number;
  }) {
    const { data } = await api.get<WhatsAppConversationPage>(endpoints.admin.whatsappConversations, {
      params,
    });
    return data;
  },
  /** One contact's thread. */
  async thread(id: string, limit = 60) {
    const { data } = await api.get<WhatsAppThread>(endpoints.admin.whatsappThread(id), {
      params: { limit },
    });
    return data;
  },
  /** Pause or resume the channel. Audited server-side. */
  async toggle(enabled: boolean) {
    const { data } = await api.post<WhatsAppOverview>(endpoints.admin.whatsappToggle, { enabled });
    return data;
  },

  // ---- Outreach campaigns ----
  /** Which rail outreach goes out on, and what the composer must ask for. */
  async outreachRail() {
    const { data } = await api.get<{
      provider: 'meta' | 'wasender';
      freeText: boolean;
      perMinute: number;
      dailyCap: number;
    }>('/admin/whatsapp/campaigns/rail');
    return data;
  },
  async segments() {
    const { data } = await api.get<CampaignSegment[]>(endpoints.admin.whatsappSegments);
    return data;
  },
  /** Who a segment reaches right now, with a masked sample. */
  async campaignPreview(segment: string) {
    const { data } = await api.get<CampaignPreview>(endpoints.admin.whatsappCampaignPreview, {
      params: { segment },
    });
    return data;
  },
  async campaigns(limit = 30) {
    const { data } = await api.get<Campaign[]>(endpoints.admin.whatsappCampaigns, {
      params: { limit },
    });
    return data;
  },
  async campaign(id: string) {
    const { data } = await api.get<CampaignDetail>(endpoints.admin.whatsappCampaign(id));
    return data;
  },
  async sendCampaign(payload: SendCampaignPayload) {
    const { data } = await api.post<Campaign>(endpoints.admin.whatsappCampaigns, payload);
    return data;
  },
  async cancelCampaign(id: string) {
    const { data } = await api.post<CampaignDetail>(endpoints.admin.whatsappCampaignCancel(id));
    return data;
  },
  /** Requeue the recipients that failed. Never re-sends to anyone already sent. */
  async retryCampaign(id: string) {
    const { data } = await api.post<CampaignDetail>(endpoints.admin.whatsappCampaignRetry(id));
    return data;
  },
};
