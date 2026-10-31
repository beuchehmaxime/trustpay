import type Anthropic from '@anthropic-ai/sdk';

import { config } from '../config/env';
import { AppError } from '../lib/errors';
import { isVerifiedTier } from '../lib/kyc-gate';
import { prisma } from '../lib/prisma';
import { WhatsAppRepository } from '../whatsapp/whatsapp.repository';
import { WhatsAppSecurity } from '../whatsapp/whatsapp-security';
import { AssistantAgent } from './assistant.agent';
import { AssistantRepository, titleFrom } from './assistant.repository';
import { AssistantTools } from './assistant-tools';
import { AssistantVoice } from './assistant-voice';
import {
  AssistantSessionStore,
  type AssistantSession,
  type ChatMessage,
  type PendingProposal,
} from './assistant.session';

/**
 * The in-app assistant.
 *
 * This file exists to hold one rule, and most of what is in it is there to make
 * that rule impossible to get around rather than to make the chat work:
 *
 *   The model proposes. A human approves. Only the approval executes.
 *
 * `chat()` can reach the agent and the agent can reach the tools, but neither
 * can reach `WhatsAppTools.executeConfirmed`. The only call to it in this file
 * is inside `confirm()`, after a PIN. That is the whole separation, and the
 * test file next door is written to break it rather than to confirm it.
 *
 * A second, quieter rule: the client never names the action it is approving. It
 * sends back a proposal id and nothing else, and the server looks up what it
 * actually proposed. A tampered request has nowhere to put a different amount.
 */

/** Tools that need a verified identity before they are even worth proposing. */
const VERIFICATION_GATED = new Set(['create_deal', 'send_money', 'withdraw']);

/** The longest message worth sending to a model. Past this it is paste, not chat. */
const MAX_MESSAGE_LENGTH = 2000;

interface ChatUser {
  id: string;
  phone: string | null;
  locale: 'en' | 'fr';
  kycTier: number;
}

async function loadUser(userId: string): Promise<ChatUser> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, phone: true, locale: true, kycTier: true },
  });
  if (!user) throw new AppError(401, 'Q-401', 'Authentication required');
  return {
    id: user.id,
    phone: user.phone,
    locale: user.locale === 'fr' ? 'fr' : 'en',
    kycTier: user.kycTier,
  };
}

/**
 * Make sure there is somewhere to keep this user's transaction PIN.
 *
 * The PIN is stored on the WhatsApp channel row, because WhatsApp is where it
 * was first needed. Someone who has only ever used the app has no such row, so
 * setting a PIN here has to create one.
 *
 * `optIn: false` is the part worth reading twice. The column defaults to true,
 * and a row created with that default would opt someone into WhatsApp messages
 * they never asked for, as a side effect of setting a PIN in a completely
 * different product surface. Consent is given explicitly on the WhatsApp
 * channel or it is not given at all.
 *
 * Reusing the same PIN across both surfaces is the deliberate choice here: a
 * second, separate app PIN would mean two secrets for one purpose, and the user
 * remembering which is which at the moment they are approving a transfer.
 */
async function ensurePinRecord(user: ChatUser): Promise<void> {
  if (await WhatsAppRepository.getChannelByUser(user.id)) return;
  if (!user.phone) {
    throw new AppError(
      409,
      'Q-409-NO-PHONE',
      'Add a phone number to your account before setting a transaction PIN.',
    );
  }
  await prisma.whatsAppChannel.create({
    data: { userId: user.id, phone: user.phone, locale: user.locale, optIn: false },
  });
}

function verificationRefusal(tool: string, locale: 'en' | 'fr'): string {
  if (locale === 'fr') {
    if (tool === 'send_money') {
      return "Pour envoyer de l'argent, votre compte doit d'abord etre verifie. Recevoir fonctionne dans tous les cas.";
    }
    if (tool === 'withdraw') {
      return "Pour retirer, votre compte doit d'abord etre verifie. Votre argent reste en securite dans votre portefeuille en attendant.";
    }
    return "Pour creer un accord, votre compte doit d'abord etre verifie.";
  }
  if (tool === 'send_money') {
    return 'Sending money needs a verified account first. Receiving works either way.';
  }
  if (tool === 'withdraw') {
    return 'Withdrawing needs a verified account first. Your money stays safe in your wallet until then.';
  }
  return 'Creating a deal needs a verified account first.';
}

/**
 * Turn the stored thread into the shape the model reads.
 *
 * Only plain text goes back, never the tool calls from earlier turns. Replaying
 * those would mean replaying their results too, and a stale balance quoted as
 * if it were current is worse than no history at all.
 */
function historyFor(session: AssistantSession): Anthropic.MessageParam[] {
  return session.messages.map((message) => ({
    role: message.role,
    content: message.content,
  }));
}

/**
 * Find or start the conversation this user is writing into.
 *
 * The open conversation is remembered in the Redis session, so a refresh keeps
 * writing to the same one. When that session has expired, the most recent
 * conversation is reopened rather than a new one started - someone coming back
 * an hour later is almost always continuing, not beginning again, and the
 * alternative scatters one topic across several entries in their list.
 */
async function activeConversation(session: AssistantSession, firstMessage: string): Promise<string> {
  if (session.conversationId) {
    if (await AssistantRepository.ownsConversation(session.userId, session.conversationId)) {
      return session.conversationId;
    }
    // Deleted from another tab. Fall through and start a fresh one.
    session.conversationId = undefined;
  }

  const latest = await AssistantRepository.latestConversation(session.userId);
  if (latest) {
    session.conversationId = latest;
    return latest;
  }

  const created = await AssistantRepository.createConversation(
    session.userId,
    titleFrom(firstMessage),
  );
  session.conversationId = created;
  return created;
}

/**
 * Write an assistant line into whichever conversation is open.
 *
 * Used by the approval paths, where the outcome ("Sent 5,000 FCFA...") is the
 * single most important line in the thread and the one a user is most likely
 * to come back looking for. If no conversation is open the line is dropped
 * rather than inventing one to hold it.
 */
async function appendToOpenConversation(
  session: AssistantSession,
  content: string,
): Promise<void> {
  if (!session.conversationId || !content) return;
  await AssistantRepository.append(session.conversationId, 'assistant', content);
}

/** What a proposal looks like to the client. Note what is absent: the args. */
export interface ProposalView {
  id: string;
  tool: string;
  summary: string;
  requiresPin: boolean;
  /** The user has no PIN yet and must set one before this can be approved. */
  needsPinSetup: boolean;
  expiresAt: number;
}

function viewOf(proposal: PendingProposal, hasPin: boolean): ProposalView {
  return {
    id: proposal.id,
    tool: proposal.tool,
    summary: proposal.summary,
    requiresPin: proposal.requiresPin && config.whatsapp.requirePin,
    needsPinSetup: proposal.requiresPin && config.whatsapp.requirePin && !hasPin,
    expiresAt: proposal.proposedAt + 5 * 60 * 1000,
  };
}

export interface ChatReply {
  reply: string;
  /** Which conversation this landed in, so the client can follow a new one. */
  conversationId?: string;
  proposal?: ProposalView;
  /** True when the model itself could not be reached, so the UI can say so. */
  unavailable?: boolean;
}

export const AssistantService = {
  /** Whether the assistant is configured at all, for the UI to hide itself. */
  available(): boolean {
    return AssistantAgent.available();
  },

  /** Whether voice input is configured, so the mic can hide rather than fail. */
  voiceAvailable(): boolean {
    return AssistantVoice.available();
  },

  /**
   * The open conversation, read from the record rather than the cache.
   *
   * This is what makes a refresh harmless. The Redis session may well have
   * expired; the messages are in Postgres either way, and the worst case is
   * that a pending proposal is gone, which is correct - a confirmation should
   * not survive half an hour of silence.
   */
  async history(
    userId: string,
    conversationId?: string,
  ): Promise<{ conversationId: string | null; messages: ChatMessage[]; proposal?: ProposalView }> {
    const session = await AssistantSessionStore.get(userId);

    let openId = conversationId ?? session?.conversationId ?? null;
    if (openId && !(await AssistantRepository.ownsConversation(userId, openId))) {
      // Either not theirs or already deleted. Say "nothing open" rather than
      // confirming whether that id exists for somebody else.
      openId = null;
    }
    if (!openId) openId = await AssistantRepository.latestConversation(userId);
    if (!openId) return { conversationId: null, messages: [] };

    // Asked for a specific conversation, so make it the one being written to.
    if (session && session.conversationId !== openId) {
      session.conversationId = openId;
      // Switching conversations drops any proposal from the old one: approving
      // a card that belongs to a different thread is never what was meant.
      session.pending = undefined;
      await AssistantSessionStore.save(session);
    }

    const messages = await AssistantRepository.messages(openId);
    const live =
      session?.pending &&
      !AssistantSessionStore.expired(session.pending) &&
      session.conversationId === openId;

    return {
      conversationId: openId,
      messages,
      proposal: live ? viewOf(session!.pending!, await WhatsAppSecurity.hasPin(userId)) : undefined,
    };
  },

  /** Past conversations, most recent first. */
  async conversations(userId: string) {
    return AssistantRepository.listConversations(userId);
  },

  /**
   * Start a new conversation.
   *
   * Note what this does NOT do: delete anything. The button used to wipe the
   * thread, which is a reasonable thing to want and a terrible default - it
   * made every "start again" destroy a record the user might need. The old
   * conversation stays in the list; only the empty one being abandoned is
   * tidied away.
   */
  async newConversation(userId: string): Promise<{ conversationId: null }> {
    const session = await AssistantSessionStore.get(userId);
    if (session?.conversationId) {
      await AssistantRepository.discardIfEmpty(session.conversationId);
    }
    if (session) {
      session.conversationId = undefined;
      session.pending = undefined;
      await AssistantSessionStore.save(session);
    }
    // No row is created until something is actually said, so opening and
    // closing the panel does not litter the list with empty entries.
    return { conversationId: null };
  },

  /** Delete one conversation, with everything in it. */
  async deleteConversation(userId: string, conversationId: string): Promise<void> {
    const deleted = await AssistantRepository.deleteConversation(userId, conversationId);
    if (!deleted) throw new AppError(404, 'Q-404', 'That conversation was not found.');
    const session = await AssistantSessionStore.get(userId);
    if (session?.conversationId === conversationId) {
      session.conversationId = undefined;
      session.pending = undefined;
      await AssistantSessionStore.save(session);
    }
  },

  /**
   * One message from the user.
   *
   * Nothing in here executes. The furthest it can go is to put a proposal in
   * the session for `confirm` to pick up.
   */
  async chat(userId: string, text: string): Promise<ChatReply> {
    const message = text.trim();
    if (!message) throw new AppError(400, 'Q-400', 'Say something first.');
    if (message.length > MAX_MESSAGE_LENGTH) {
      throw new AppError(400, 'Q-400', 'That message is too long for the assistant.');
    }

    const user = await loadUser(userId);
    const session = await AssistantSessionStore.getOrCreate(userId, user.locale);
    session.locale = user.locale;

    // A new message supersedes an untaken proposal. Leaving the old one live
    // while the conversation moved on is how someone ends up approving a card
    // that answers a question they are no longer asking.
    session.pending = undefined;

    const conversationId = await activeConversation(session, message);

    // Written down before the model is called, not after. A turn that times
    // out or crashes must not lose what the user said - that is the half of
    // the exchange they cannot reproduce.
    await AssistantRepository.append(conversationId, 'user', message);

    const context = await AssistantRepository.contextFor(conversationId);
    const turn = await AssistantAgent.run(
      message,
      // The message just stored is the one being sent, so it is dropped from
      // the prior context to avoid handing the model the same line twice.
      historyFor({ ...session, messages: context.slice(0, -1) }),
      { userId: user.id, locale: user.locale },
    );

    const record = async (role: ChatMessage['role'], content: string) => {
      if (content) await AssistantRepository.append(conversationId, role, content);
    };

    if (turn.pending) {
      // Refuse here rather than at execution time. The gate is enforced again
      // deeper down by `assertCanTransact`, which is where it actually counts;
      // this one exists so the user is told before they are shown a card and a
      // PIN prompt for something that was never going to go through.
      if (VERIFICATION_GATED.has(turn.pending.tool) && !isVerifiedTier(user.kycTier)) {
        const refusal = verificationRefusal(turn.pending.tool, user.locale);
        await record('assistant', refusal);
        await AssistantSessionStore.save(session);
        return { reply: refusal, conversationId };
      }

      const proposal = AssistantSessionStore.propose(turn.pending);
      session.pending = proposal;
      const spoken = turn.text || proposal.summary;
      await record('assistant', spoken);
      await AssistantSessionStore.save(session);
      return {
        reply: spoken,
        conversationId,
        proposal: viewOf(proposal, await WhatsAppSecurity.hasPin(userId)),
      };
    }

    const reply =
      turn.text ||
      (turn.unavailable
        ? 'The assistant is not available right now.'
        : 'Sorry, I did not catch that. Could you say it another way?');
    await record('assistant', reply);
    await AssistantSessionStore.save(session);
    return { reply, conversationId, unavailable: turn.unavailable };
  },

  /**
   * A voice note: transcribe it, then treat the words as the user's message.
   *
   * The transcript is returned alongside the reply rather than kept hidden.
   * Speech recognition gets things wrong, and someone whose complaint was
   * misheard needs to see what the machine thought they said - otherwise the
   * assistant answers a question they never asked and they have no way to tell
   * why.
   */
  async voice(userId: string, audio: Buffer): Promise<ChatReply & { transcript: string }> {
    const { text } = await AssistantVoice.transcribe(audio);
    const result = await this.chat(userId, text.slice(0, MAX_MESSAGE_LENGTH));
    return { ...result, transcript: text };
  },

  /** Set a transaction PIN, for a user who does not have one yet. */
  async setPin(userId: string, pin: string): Promise<void> {
    if (!WhatsAppSecurity.isValidPinFormat(pin)) {
      throw new AppError(400, 'Q-400-PIN', 'Your PIN must be 4 to 6 digits.');
    }
    if (await WhatsAppSecurity.hasPin(userId)) {
      // Changing a PIN is an account-security action with its own flow and its
      // own re-authentication. It does not belong behind a chat endpoint.
      throw new AppError(409, 'Q-409-PIN', 'You already have a PIN. Change it in Settings.');
    }
    await ensurePinRecord(await loadUser(userId));
    await WhatsAppSecurity.setPin(userId, pin);
  },

  /**
   * Approve the proposal currently on the session, and only that one.
   *
   * The single place in the in-app assistant where anything executes.
   */
  async confirm(userId: string, proposalId: string, pin?: string): Promise<ChatReply> {
    const user = await loadUser(userId);
    const session = await AssistantSessionStore.get(userId);
    const proposal = session?.pending;

    if (!session || !proposal) {
      throw new AppError(409, 'Q-409-NO-PROPOSAL', 'There is nothing waiting to be approved.');
    }
    // Compared against what the SERVER stored, not against what the client
    // described. A request quoting a different id is a request to approve
    // something that is no longer on the table.
    if (proposal.id !== proposalId) {
      throw new AppError(409, 'Q-409-STALE', 'That request has been replaced by a newer one.');
    }
    if (AssistantSessionStore.expired(proposal)) {
      session.pending = undefined;
      await AssistantSessionStore.save(session);
      throw new AppError(410, 'Q-410-EXPIRED', 'That confirmation expired. Ask me again.');
    }

    const pinRequired = proposal.requiresPin && config.whatsapp.requirePin;
    if (pinRequired && !AssistantSessionStore.stepUpValid(session)) {
      if (!(await WhatsAppSecurity.hasPin(userId))) {
        throw new AppError(428, 'Q-428-PIN-SETUP', 'Create a 4 to 6 digit PIN to approve this.');
      }
      if (!pin) {
        throw new AppError(428, 'Q-428-PIN', 'Enter your PIN to approve this.');
      }
      const check = await WhatsAppSecurity.verifyPin(userId, pin);
      if (check.result === 'locked') {
        // The proposal is dropped as well as refused. A locked account should
        // not come back to a live money action waiting to be approved.
        session.pending = undefined;
        await AssistantSessionStore.save(session);
        throw new AppError(
          423,
          'Q-423-PIN-LOCKED',
          'Too many wrong PIN attempts. Money actions are locked until support unlocks them.',
        );
      }
      if (check.result === 'wrong') {
        throw new AppError(401, 'Q-401-PIN', `Wrong PIN. ${check.left} attempts left.`, {
          attemptsLeft: check.left,
        });
      }
      session.lastStepUpAt = Date.now();
    }

    // Cleared BEFORE execution, not after. If the call throws halfway, the
    // proposal must not still be sitting there approvable - a second approval
    // of a transfer that may already have happened is the one failure here
    // that costs a user real money.
    session.pending = undefined;
    await AssistantSessionStore.save(session);

    try {
      const outcome = await AssistantTools.executeConfirmed(proposal, {
        userId: user.id,
        locale: user.locale,
      });
      await appendToOpenConversation(session, outcome);
      await AssistantSessionStore.save(session);
      return { reply: outcome, conversationId: session.conversationId };
    } catch (error) {
      const reason = error instanceof AppError ? error.message : 'That did not go through.';
      // Said plainly, and not re-proposed. The user asked once; if they still
      // want it they will ask again, and that is their call to make.
      const failure =
        user.locale === 'fr' ? `Cela n'a pas abouti. ${reason}` : `That did not go through. ${reason}`;
      await appendToOpenConversation(session, failure);
      await AssistantSessionStore.save(session);
      return { reply: failure, conversationId: session.conversationId };
    }
  },

  /** Drop the pending proposal without doing it. */
  async cancel(userId: string, proposalId: string): Promise<ChatReply> {
    const session = await AssistantSessionStore.get(userId);
    if (!session?.pending || session.pending.id !== proposalId) {
      return { reply: 'There was nothing waiting.' };
    }
    session.pending = undefined;
    const reply = session.locale === 'fr' ? "D'accord, annule." : 'Okay, cancelled.';
    await appendToOpenConversation(session, reply);
    await AssistantSessionStore.save(session);
    return { reply, conversationId: session.conversationId };
  },
};
