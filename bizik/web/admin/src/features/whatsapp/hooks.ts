import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { adminWhatsAppApi } from './whatsapp.api';
import type { SendCampaignPayload, WhatsAppConversationFilter } from './types';

const WHATSAPP_KEY = ['admin', 'whatsapp'] as const;

export function useWhatsAppOverview(days = 14) {
  return useQuery({
    queryKey: [...WHATSAPP_KEY, 'overview', days],
    queryFn: () => adminWhatsAppApi.overview(days),
    // The channel is live traffic; a stale view is worse than a refetch.
    refetchInterval: 60_000,
  });
}

export function useWhatsAppMessages(limit = 50) {
  return useQuery({
    queryKey: [...WHATSAPP_KEY, 'messages', limit],
    queryFn: () => adminWhatsAppApi.messages(limit),
    refetchInterval: 60_000,
  });
}

/** The conversation list: one row per contact, searchable and filterable. */
export function useWhatsAppConversations(params: {
  search?: string;
  filter?: WhatsAppConversationFilter;
  limit?: number;
  offset?: number;
}) {
  return useQuery({
    queryKey: [...WHATSAPP_KEY, 'conversations', params],
    queryFn: () => adminWhatsAppApi.conversations(params),
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  });
}

/** One contact's thread; skipped until a conversation is selected. */
export function useWhatsAppThread(id: string | null) {
  return useQuery({
    queryKey: [...WHATSAPP_KEY, 'thread', id],
    queryFn: () => adminWhatsAppApi.thread(id as string),
    enabled: !!id,
    refetchInterval: 30_000,
  });
}

/** Pause or resume the assistant, then refresh every view of it. */
export function useToggleWhatsApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => adminWhatsAppApi.toggle(enabled),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: WHATSAPP_KEY }),
  });
}

// ---- Outreach campaigns -----------------------------------------------------

const CAMPAIGN_KEY = [...WHATSAPP_KEY, 'campaigns'] as const;

/** The segment catalogue with live counts - what an operator chooses from. */
export function useCampaignSegments() {
  return useQuery({
    queryKey: [...CAMPAIGN_KEY, 'segments'],
    queryFn: () => adminWhatsAppApi.segments(),
    // Counts move as people sign up and verify, but not fast enough to poll.
    staleTime: 60_000,
  });
}

/**
 * Which rail is live. The composer asks for a template name or the message
 * itself depending on this, because the two rails genuinely need different
 * things and showing both would mean one field always does nothing.
 */
export function useOutreachRail() {
  return useQuery({
    queryKey: [...CAMPAIGN_KEY, 'rail'],
    queryFn: () => adminWhatsAppApi.outreachRail(),
    staleTime: 5 * 60_000,
  });
}

/** Who the chosen segment reaches; skipped until one is chosen. */
export function useCampaignPreview(segment: string | null) {
  return useQuery({
    queryKey: [...CAMPAIGN_KEY, 'preview', segment],
    queryFn: () => adminWhatsAppApi.campaignPreview(segment as string),
    enabled: !!segment,
  });
}

export function useCampaigns(limit = 30) {
  return useQuery({
    queryKey: [...CAMPAIGN_KEY, 'list', limit],
    queryFn: () => adminWhatsAppApi.campaigns(limit),
    // A campaign sends in the background, so its counters climb after the
    // request returns; refresh while the page is open.
    refetchInterval: 15_000,
  });
}

/** One campaign with its per-recipient outcomes. */
export function useCampaign(id: string | null) {
  return useQuery({
    queryKey: [...CAMPAIGN_KEY, 'detail', id],
    queryFn: () => adminWhatsAppApi.campaign(id as string),
    enabled: !!id,
    refetchInterval: (query) =>
      query.state.data?.status === 'SENDING' ? 5_000 : false,
  });
}

export function useSendCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SendCampaignPayload) => adminWhatsAppApi.sendCampaign(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CAMPAIGN_KEY }),
  });
}

export function useCancelCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminWhatsAppApi.cancelCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CAMPAIGN_KEY }),
  });
}

/**
 * Retry the failures of a finished or stopped campaign.
 *
 * Safe to press twice: the backend only ever requeues FAILED rows, and anyone
 * already SENT is not one.
 */
export function useRetryCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => adminWhatsAppApi.retryCampaign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CAMPAIGN_KEY }),
  });
}
