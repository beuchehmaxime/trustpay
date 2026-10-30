import { api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';

/**
 * The in-app assistant.
 *
 * Worth reading for what is NOT in these types: a proposal carries a summary
 * and an id, never the amount, the recipient or the tool arguments. The client
 * cannot see the action it is approving in a form it could alter, and `confirm`
 * sends back only the id - the server looks up what it actually proposed. A
 * tampered request has nowhere to put a different amount.
 */

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
  at: number;
}

export interface AssistantProposal {
  id: string;
  /** The action's name, for the icon. Never used to decide what runs. */
  tool: string;
  /** Human-readable, written by the backend, shown on the card. */
  summary: string;
  requiresPin: boolean;
  /** The user has no transaction PIN yet and must set one to approve. */
  needsPinSetup: boolean;
  expiresAt: number;
}

export interface AssistantReply {
  reply: string;
  proposal?: AssistantProposal;
  /** The model itself could not be reached, so the UI says that rather than
   *  implying the assistant did not understand. */
  unavailable?: boolean;
}

export interface AssistantThread {
  messages: AssistantMessage[];
  proposal?: AssistantProposal;
}

export const assistantApi = {
  async status() {
    const { data } = await api.get<{ available: boolean; voice: boolean }>(
      endpoints.assistant.status,
    );
    return data;
  },
  /**
   * Send a voice note.
   *
   * The transcript comes back with the reply rather than staying hidden:
   * speech recognition gets things wrong, and someone who was misheard needs
   * to see what the machine thought they said.
   */
  async voice(audioBase64: string) {
    const { data } = await api.post<AssistantReply & { transcript: string }>(
      endpoints.assistant.voice,
      { audio: audioBase64 },
    );
    return data;
  },
  async history() {
    const { data } = await api.get<AssistantThread>(endpoints.assistant.history);
    return data;
  },
  async chat(message: string) {
    const { data } = await api.post<AssistantReply>(endpoints.assistant.chat, { message });
    return data;
  },
  /** The only call that can move money, and the PIN is why it may. */
  async confirm(proposalId: string, pin?: string) {
    const { data } = await api.post<AssistantReply>(endpoints.assistant.confirm, {
      proposalId,
      pin,
    });
    return data;
  },
  async cancel(proposalId: string) {
    const { data } = await api.post<AssistantReply>(endpoints.assistant.cancel, { proposalId });
    return data;
  },
  async setPin(pin: string) {
    await api.post(endpoints.assistant.pin, { pin });
  },
  async reset() {
    await api.post(endpoints.assistant.reset);
  },
};
