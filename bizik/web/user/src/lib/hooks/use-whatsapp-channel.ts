import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * The account owner's view of their WhatsApp channel. Locking can be done from
 * the chat itself, but UNLOCKING is only possible here - a locked channel means
 * the number may not be in the owner's hands any more, so getting back in has
 * to go through a signed-in session.
 */
export interface WhatsAppChannelStatus {
  linked: boolean;
  phone: string | null;
  optIn: boolean;
  locked: boolean;
  hasPin: boolean;
  /** Wrong-PIN attempts have already frozen money actions in the chat. */
  lockedOut: boolean;
}

export function useWhatsAppChannel() {
  return useQuery({
    queryKey: ['whatsapp-channel'],
    queryFn: async () => {
      const { data } = await api.get<WhatsAppChannelStatus>(endpoints.user.whatsapp);
      return data;
    },
  });
}

/** Lock / unlock / reset-PIN / opt-out, each returning the refreshed status. */
export function useWhatsAppChannelAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: 'lock' | 'unlock' | 'resetPin' | { optIn: boolean }) => {
      if (typeof action === 'object') {
        const { data } = await api.patch<WhatsAppChannelStatus>(endpoints.user.whatsapp, action);
        return data;
      }
      const url =
        action === 'lock'
          ? endpoints.user.whatsappLock
          : action === 'unlock'
            ? endpoints.user.whatsappUnlock
            : endpoints.user.whatsappPinReset;
      const { data } = await api.post<WhatsAppChannelStatus>(url);
      return data;
    },
    onSuccess: (data) => queryClient.setQueryData(['whatsapp-channel'], data),
  });
}
