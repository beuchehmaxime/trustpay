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
  /** Which conversation this landed in, so the client can follow a new one. */
  conversationId?: string;
  proposal?: AssistantProposal;
  /** The model itself could not be reached, so the UI says that rather than
   *  implying the assistant did not understand. */
  unavailable?: boolean;
}

export interface AssistantThread {
  /** Null when this user has never said anything yet. */
  conversationId: string | null;
  messages: AssistantMessage[];
  proposal?: AssistantProposal;
}

/** One past conversation, for the list. */
export interface AssistantConversation {
  id: string;
  title: string;
  preview: string;
  lastMessageAt: number;
  messageCount: number;
}

/**
 * How long an assistant call may take.
 *
 * The shared client times out at 30 seconds, which is right for ordinary API
 * calls and far too short here. Muse Spark reasons before it answers and may
 * run several tool hops, and transcription is a round trip to another model
 * on top of that. The old 30s cut genuine answers off mid-flight and showed
 * the user a failure for a request that was still working.
 *
 * Set per call rather than on the shared instance: a wallet or deal request
 * that hangs for two minutes IS broken and should still fail fast.
 */
const ASSISTANT_TIMEOUT_MS = 180_000;

export const assistantApi = {
  async status() {
    const { data } = await api.get<{ available: boolean; voice: boolean }>(
      endpoints.assistant.status,
    );
    return data;
  },
  /**
   * Transcribe a recording. Does NOT answer it - the transcript comes back so
   * it can be shown immediately, then sent as an ordinary message.
   *
   * Showing it also matters on its own: speech recognition mishears, and
   * someone whose complaint was misread needs to see what the machine thought
   * they said.
   */
  async voice(audioBase64: string) {
    const { data } = await api.post<{ transcript: string }>(
      endpoints.assistant.voice,
      { audio: audioBase64 },
      { timeout: ASSISTANT_TIMEOUT_MS },
    );
    return data;
  },
  /** The open conversation, or a named one. */
  async history(conversationId?: string) {
    const { data } = await api.get<AssistantThread>(endpoints.assistant.history, {
      params: conversationId ? { conversationId } : undefined,
    });
    return data;
  },
  async conversations() {
    const { data } = await api.get<AssistantConversation[]>(endpoints.assistant.conversations);
    return data;
  },
  async deleteConversation(id: string) {
    await api.delete(endpoints.assistant.conversation(id));
  },
  async chat(message: string) {
    const { data } = await api.post<AssistantReply>(
      endpoints.assistant.chat,
      { message },
      { timeout: ASSISTANT_TIMEOUT_MS },
    );
    return data;
  },
  /** The only call that can move money, and the PIN is why it may. */
  async confirm(proposalId: string, pin?: string) {
    const { data } = await api.post<AssistantReply>(
      endpoints.assistant.confirm,
      { proposalId, pin },
      { timeout: ASSISTANT_TIMEOUT_MS },
    );
    return data;
  },
  async cancel(proposalId: string) {
    const { data } = await api.post<AssistantReply>(endpoints.assistant.cancel, { proposalId });
    return data;
  },
  async setPin(pin: string) {
    await api.post(endpoints.assistant.pin, { pin });
  },
  /** Start a new conversation. Deletes nothing - the old one stays in the list. */
  async newConversation() {
    await api.post(endpoints.assistant.reset);
  },
};
