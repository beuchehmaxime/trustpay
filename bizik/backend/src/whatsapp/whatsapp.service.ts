import type Anthropic from '@anthropic-ai/sdk';

import { config } from '../config/env';
import { accountBlockedReason, canAccountAct } from '../lib/account-status';
import { legalLinks, recordConsent } from '../lib/consent';
import { ContractService } from '../contract/contract.service';
import { KycService } from '../kyc/kyc.service';
import { prisma } from '../lib/prisma';
import { provisionUserWallets } from '../lib/seed';
import { homeCurrencyFor, localeForCountry } from '../lib/domain';
import { systemSettings } from '../lib/system-settings';
import { TransferService } from '../transfer/transfer.service';
import { UsernameService } from '../user/username.service';
import { WhatsAppAI } from './whatsapp-ai';
import { WhatsAppBudget } from './whatsapp-budget';
import { actionKey, asksToRetry, looseActionKey, shouldSuppressRepeat } from './retry-guard';
import {
  dealRefIn,
  looksLikeCancelRequest,
  looksLikeDealListRequest,
  parseDeposit,
  parseSendMoney,
} from './whatsapp-intent';
import { stripEmoji } from './whatsapp-format';
import {
  cleanPersonName,
  guestCopy,
  isExplicitAgreement,
  looksLikePersonName,
  type GuestDecision,
  type GuestLocale,
  type GuestSignupState,
} from './whatsapp-guest';
import { isClearlyOutOfScope, outOfScopeReply, replyLeftScope } from './whatsapp-scope';
import { WhatsAppClient, type ListRow } from './whatsapp-client';
import { WhatsAppNotify } from './whatsapp-notify';
import { WhatsAppRepository } from './whatsapp.repository';
import { WaSessionStore, type WaSession, type PendingAction } from './whatsapp-session';
import { WhatsAppSecurity } from './whatsapp-security';
import { WhatsAppTools, type ToolContext } from './whatsapp-tools';

/**
 * Inbound orchestration for the WhatsApp Assistant: identity → session →
 * commands / onboarding / confirmation+PIN / AI. The single entry point is
 * `handleInbound`, called by the webhook controller.
 */

export interface InboundMessage {
  phone: string;
  waMessageId: string;
  kind: 'text' | 'interactive' | 'audio' | 'image' | 'document' | 'other';
  text?: string; // text body, or the id/title of a tapped button/list row
  mediaId?: string;
  mimeType?: string;
}

/**
 * The markets BiZik is open in, as a WhatsApp list (max 10 rows). Country is
 * not cosmetic: it sets the account's home currency and default language, so
 * onboarding asks for it instead of assuming one.
 */
function countryRows(): ListRow[] {
  return systemSettings()
    .markets.countries.filter((country) => country.enabled)
    .slice(0, 10)
    .map((country) => ({
      id: `country_${country.name}`,
      title: country.name.slice(0, 24),
      description: `Currency: ${country.currency}`,
    }));
}

/** Match a typed or tapped country against the enabled markets. */
function resolveCountry(text: string): string | null {
  const raw = text.trim().replace(/^country_/i, '').toLowerCase();
  if (!raw) return null;
  const enabled = systemSettings().markets.countries.filter((country) => country.enabled);
  return (
    enabled.find((country) => country.name.toLowerCase() === raw)?.name ??
    enabled.find((country) => country.name.toLowerCase().startsWith(raw))?.name ??
    null
  );
}

const ID_TYPE_ROWS: ListRow[] = [
  { id: 'kyc_id_NATIONAL_ID', title: 'National ID' },
  { id: 'kyc_id_PASSPORT', title: 'Passport' },
  { id: 'kyc_id_DRIVERS_LICENSE', title: "Driver's licence" },
  { id: 'kyc_id_VOTERS_CARD', title: "Voter's card" },
];

async function reply(session: WaSession, text: string) {
  await WhatsAppClient.sendText(session.phone, text);
  await WhatsAppRepository.logMessage({
    phone: session.phone,
    userId: session.userId,
    direction: 'OUTBOUND',
    kind: 'text',
    body: text,
  });
}

/**
 * Conversational "what can I do" prompt - NO tappable bot menu. Everything is
 * driven by the AI: the user just says what they want ("create a deal", "my
 * balance", "fund my deal", "withdraw", "verify me") in their own words or a
 * voice note. A short verification nudge is appended when they're not verified.
 */
async function sendMenu(session: WaSession) {
  const lines = [
    '💬 *What would you like to do?*',
    '',
    '• “create a deal”',
    '• “deposit 5000” to add money to your wallet',
    '• “fund my deal” or “pay”',
    '• “my deals”',
    '• “send 5000 to @handle”',
    '• “my balance” or “my handle”',
    '• “withdraw money”',
  ];
  if (session.userId) {
    const state = await WhatsAppRepository.getKycState(
      session.userId,
      systemSettings().verification.standardTier,
    );
    if (state === 'more_info') lines.push('• “provide more information” (to finish verifying)');
    else if (state === 'rejected' || state === 'none') lines.push('• “verify my account”');
  }
  lines.push('', '🎙️ Type it, or send a voice note.');
  await reply(session, lines.join('\n'));
}

async function sendConfirm(session: WaSession, summary: string) {
  await WhatsAppClient.sendButtons(session.phone, summary, [
    { id: 'confirm', title: 'Confirm' },
    { id: 'cancel', title: 'Cancel' },
  ]);
  await WhatsAppRepository.logMessage({
    phone: session.phone,
    userId: session.userId,
    direction: 'OUTBOUND',
    kind: 'interactive',
    body: 'confirmation',
  });
}

function money(amount: number, currency = 'XAF'): string {
  const symbol = currency === 'XAF' ? 'FCFA' : currency;
  return `${symbol} ${Math.abs(amount).toLocaleString('en-US')}`;
}

/**
 * What we are allowed to keep in the message log. The audit trail records that
 * a message arrived, never its secret content: a transaction PIN and a KYC ID
 * number are typed as ordinary chat messages, so they are replaced with a
 * marker before anything is written (see WhatsAppMessage.body).
 */
function auditBody(session: WaSession, message: InboundMessage, text: string): string | null {
  if (session.awaitingPin || session.awaitingPinSetup) return '[redacted: PIN]';
  if (session.flow?.name === 'kyc' && session.flow.step === 'idNumber') {
    return '[redacted: ID number]';
  }
  if (message.kind === 'audio') return text ? `[voice] ${text}` : '[voice note: no transcript]';
  return text;
}

/**
 * Why a specific deal can't be cancelled - read from the deal itself so the
 * answer is never a generic "you have nothing to cancel" when the user is
 * looking at a deal that exists.
 */
async function cancelRefusalFor(userId: string, dealId: string): Promise<string> {
  const deal = await prisma.contract.findUnique({
    where: { id: dealId },
    select: { creatorId: true, status: true, title: true, milestones: { select: { status: true } } },
  });
  if (!deal) return `I couldn't find the deal ${dealId}. Send *MY DEALS* to see your deals.`;
  if (deal.creatorId !== userId) {
    return `Only the person who created *${deal.title}* can cancel it. You can *decline* it instead if it's still waiting on you, or open a dispute once it's funded.`;
  }
  if (deal.status === 'CANCELLED') return `*${deal.title}* is already cancelled.`;
  if (deal.status === 'COMPLETED') return `*${deal.title}* is already completed, so it can't be cancelled.`;
  return `*${deal.title}* has already been funded, so it can no longer be cancelled. You'd refund the funded milestone or open a dispute instead.`;
}

/** Nothing to cancel - say why, and point at what they DO have. */
async function noCancellableDealsMessage(userId: string): Promise<string> {
  const [created, invited] = await Promise.all([
    prisma.contract.count({
      where: { creatorId: userId, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
    }),
    prisma.contract.count({
      where: { counterpartyId: userId, status: { notIn: ['CANCELLED', 'COMPLETED'] } },
    }),
  ]);
  if (created === 0) {
    const alsoInvited = invited
      ? ` You are part of ${invited} deal${invited === 1 ? '' : 's'} someone invited you to. Say *invited deals* to see ${invited === 1 ? 'it' : 'them'}. If you want out of one of those, you *decline* it instead.`
      : '';
    return `You haven't created any open deals, so there's nothing for you to cancel. Only the person who created a deal can cancel it.${alsoInvited}`;
  }
  return 'All of your open deals have already been funded, so they can no longer be cancelled. Refund the funded milestone or open a dispute instead.';
}

/**
 * Record a refused action in the conversation the model sees. An assistant turn
 * that never lands in `history` is invisible to the next turn: the model still
 * believes its proposal is outstanding and simply makes it again, so the user
 * gets the same refusal no matter what they ask next.
 */
function rememberRefusal(session: WaSession, tool: string, refusal: string): void {
  session.history.push({
    role: 'assistant',
    content: `${refusal} (I did NOT run ${tool}: the account is not verified yet. Do not propose it again until they are verified; answer whatever they ask next on its own merits.)`,
  });
}

/**
 * Actions that move value OUT of an account, or commit someone else's money.
 * Each needs a verified identity. Receiving, funding a deal you were invited to
 * and every read stay open - see lib/kyc-gate.ts for the reasoning.
 */
const GATED_TOOLS = new Set(['create_deal', 'send_money', 'withdraw']);

function kycRefusalFor(tool: string): string {
  if (tool === 'send_money') {
    return '💸 Got it. Sending money needs a *verified account* first. Receiving works either way.';
  }
  if (tool === 'withdraw') {
    return '🏧 Got it. Withdrawing needs a *verified account* first. Your money stays safe in your wallet until then.';
  }
  return '📝 Got it. Creating a deal needs a *verified account* first.';
}

/** Creating a deal requires a verified account; paying/funding does NOT. */
function needsKycForDeal(kycTier: number): boolean {
  const settings = systemSettings();
  return settings.general.kycRequiredForContracts && kycTier < settings.verification.standardTier;
}

/**
 * The first thing anyone receives, and the one place the channel can say what
 * it is.
 *
 * The AI disclosure is not decoration. Someone messaging a number about their
 * money is entitled to know whether a person is reading it, and saying so is
 * both the honest thing and what the EU AI Act Art. 50 and ISO 42001 ask of a
 * system that converses with people. It sits ABOVE the capability list on
 * purpose: disclosure after the sales pitch is not disclosure.
 *
 * It points at support@bizik.cm rather than offering a "type HUMAN" keyword,
 * because no such handoff exists in this channel. Promising one that silently
 * does nothing would be worse than not mentioning a human at all.
 */
const WELCOME_TEXT =
  '👋 *Welcome to BiZik*\nSecure escrow for everyone.\n\n' +
  '🤖 I am an automated assistant, not a person. I handle most things ' +
  'here myself; for anything I cannot, email support@bizik.cm and a member of ' +
  'our team will reply.\n\n' +
  'I hold a buyer\'s money safely until the goods or work are delivered and approved, then the seller is paid. No more getting scammed. 🛡️\n\n' +
  'Here\'s what I can help you do, right here on WhatsApp:\n\n' +
  '• Start a secure deal\n' +
  '• Fund / pay a deal into escrow (MTN / Orange Money)\n' +
  '• Track your deals & release payment on delivery\n' +
  '• Check your wallet & balance\n' +
  '• Withdraw money to Mobile Money / bank\n' +
  '• Verify your account (KYC)\n' +
  '• Open a dispute if something goes wrong\n\n' +
  '💬 Just tell me what you want in your own words, or type *MENU* anytime.';

async function sendWelcome(session: WaSession) {
  await WhatsAppClient.sendText(session.phone, WELCOME_TEXT);
  // kind='welcome' is the persistent "sent once" marker (see hasWelcomed).
  await WhatsAppRepository.logMessage({
    phone: session.phone,
    userId: session.userId,
    direction: 'OUTBOUND',
    kind: 'welcome',
    body: 'welcome message',
  });
}

/**
 * Record the persistent "welcomed once" marker (see hasWelcomed) without sending
 * the fixed English welcome: guests are introduced by the front desk instead,
 * in their own language.
 */
async function markWelcomed(session: WaSession) {
  await WhatsAppRepository.logMessage({
    phone: session.phone,
    userId: session.userId,
    direction: 'OUTBOUND',
    kind: 'welcome',
    body: 'first contact (introduced by the front desk)',
  });
}

type OnboardFlow = { name: 'onboard'; step: string; data: Record<string, unknown> };

/** The guest's signup flow, if they are in one. */
function onboardFlow(session: WaSession): OnboardFlow | undefined {
  return session.flow?.name === 'onboard' ? (session.flow as OnboardFlow) : undefined;
}

/** Begin signup at the name step (keeping any deal they are accepting). */
function startOnboardFlow(session: WaSession, language: GuestLocale): OnboardFlow {
  const flow: OnboardFlow = { name: 'onboard', step: 'name', data: { language } };
  session.flow = flow;
  return flow;
}

/** What the model is told about where this guest is in signup. */
function guestState(flow: OnboardFlow | undefined): GuestSignupState {
  if (!flow) return { step: 'none' };
  const step = ['name', 'country', 'consent'].includes(flow.step)
    ? (flow.step as GuestSignupState['step'])
    : 'name';
  return {
    step,
    fullName: flow.data.fullName ? String(flow.data.fullName) : undefined,
    country: flow.data.country ? String(flow.data.country) : undefined,
    acceptingInvite: !!flow.data.acceptDealId,
  };
}

/** The language to speak to a guest in: what they chatted in, else the session's. */
function guestLocale(session: WaSession): GuestLocale {
  const chosen = onboardFlow(session)?.data.language;
  if (chosen === 'fr' || chosen === 'en') return chosen;
  return session.locale === 'fr' ? 'fr' : 'en';
}

function toAnthropicHistory(session: WaSession): Anthropic.MessageParam[] {
  // The Messages API needs the conversation to open with a user turn. Ours can
  // open with an assistant one - we speak first after a deal invite, and the
  // rolling window trims from the front - so drop any leading assistant turns.
  const firstUser = session.history.findIndex((turn) => turn.role === 'user');
  if (firstUser === -1) return [];
  return session.history
    .slice(firstUser)
    .map((turn) => ({ role: turn.role, content: turn.content }));
}

/** Words that signal a question/command rather than a literal field value. */
const INTENT_WORDS = [
  'what', 'how', 'why', 'who', 'when', 'where', 'which', 'can', 'could', 'show',
  'check', 'balance', 'wallet', 'deal', 'deals', 'fund', 'pay', 'withdraw', 'send',
  'help', 'cancel', 'menu', 'stop', 'wait', 'hold', 'actually', 'instead', 'no',
  'quel', 'comment', 'pourquoi', 'combien', 'solde', 'aide', 'payer', 'retirer',
];

/** Does `text` read like a question or a different request, not a field value? */
function looksLikeIntent(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  if (trimmed.includes('?')) return true;
  const firstWord = trimmed.split(/\s+/)[0];
  if (INTENT_WORDS.includes(firstWord)) return true;
  // A long, spaced-out sentence is a request, not an ID number / type pick.
  if (trimmed.split(/\s+/).length >= 4) return true;
  return false;
}

/**
 * Is this inbound message the input the current KYC step is waiting for?
 * Photos satisfy the photo steps; "skip"/"cancel" always pass through; an
 * ID-type pick or a plausible ID number satisfy their steps. Anything that
 * reads like a question or a different request does NOT - the AI handles it.
 */
function isKycStepInput(step: string, message: InboundMessage, text: string): boolean {
  if (message.kind === 'image') return true; // photos are always step input
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'skip' || lower === 'cancel') return true;
  if (step === 'idType') {
    return lower.startsWith('kyc_id_') || (!looksLikeIntent(trimmed) && trimmed.length > 0);
  }
  if (step === 'idNumber') {
    // An ID number is short-ish and not phrased like a question/command.
    return trimmed.length >= 4 && trimmed.length <= 24 && !looksLikeIntent(trimmed);
  }
  // Photo steps (idFront/idBack/selfie) expect an image; any text is an aside.
  return false;
}

// Affirmations/negations that answer a pending confirmation. Kept broad so a
// natural "okay/yeah/sure/go ahead" confirms, and their French equivalents.
const YES = new Set([
  'yes', 'y', 'yeah', 'yea', 'yep', 'yup', 'ok', 'okay', 'okey', 'k', 'kk',
  'sure', 'confirm', 'confirmed', 'proceed', 'go ahead', 'go', 'do it', 'correct',
  'alright', 'aight', 'fine', 'please', 'yes please',
  'oui', "d'accord", 'daccord', 'ouais', 'vas-y', 'allez', 'ça marche', 'ca marche',
]);
const NO = new Set([
  'no', 'n', 'nope', 'nah', 'no thanks', "don't", 'dont', 'stop',
  'cancel', 'annuler', 'non', 'pas maintenant',
]);

export const WhatsAppService = {
  async handleInbound(message: InboundMessage): Promise<void> {
    if (!config.whatsapp.enabled) return;
    // Operator kill switch (admin → Settings). Checked per message so turning
    // it off takes effect immediately, mid-conversation, without a redeploy.
    if (systemSettings().general.whatsappEnabled === false) return;
    // Idempotency - Meta may redeliver.
    if (message.waMessageId && (await WhatsAppRepository.alreadyProcessed(message.waMessageId))) return;

    // Resolve text (voice → transcript).
    let text = (message.text ?? '').trim();
    if (message.kind === 'audio' && message.mediaId) {
      const media = await WhatsAppClient.downloadMedia(message.mediaId);
      if (media) text = (await WhatsAppAI.transcribeVoice(media.bytes, media.mimeType)) ?? '';
    }

    // Identity. Resolved BEFORE the audit write so we know whether this message
    // is a PIN / ID number and must be redacted out of the log.
    const user = await WhatsAppRepository.findUserByPhone(message.phone);
    const session: WaSession =
      (await WaSessionStore.get(message.phone)) ??
      { phone: message.phone, locale: 'en', history: [], updatedAt: Date.now() };
    session.userId = user?.id;
    session.locale = (user?.locale as 'en' | 'fr') ?? session.locale ?? 'en';

    // Audit inbound (never the secret itself - see auditBody).
    await WhatsAppRepository.logMessage({
      phone: message.phone,
      userId: user?.id,
      direction: 'INBOUND',
      waMessageId: message.waMessageId,
      kind: message.kind,
      body: auditBody(session, message, text),
    });

    // Persistent "last seen" (before we bump it) - drives the "welcome back"
    // greeting only after a real gap, not on every 30-min session expiry.
    const lastSeenMs = await WaSessionStore.getLastSeen(session.phone);
    await WaSessionStore.touchLastSeen(session.phone);

    const lower = text.trim().toLowerCase();

    try {
      // First-ever contact. Account holders and invited numbers get the fixed
      // welcome; everyone else goes to the front desk, which reads what they
      // actually wrote and introduces BiZik in THEIR language.
      if (!(await WhatsAppRepository.hasWelcomed(session.phone))) {
        const invite = user ? null : await WhatsAppRepository.findPendingInvite(session.phone);
        if (user || invite) {
          await this.welcomeAndProceed(session, !!user);
        } else {
          await markWelcomed(session);
          await this.handleGuest(session, text, { firstContact: true });
        }
        return;
      }

      // Accepting / declining a deal invitation (works before onboarding, and
      // from a fresh session when they tap a proactively-sent invite button).
      const isAcceptTap = lower === 'accept_deal' || (lower === 'accept' && !!session.inviteDealId);
      const isDeclineTap = lower === 'decline_deal' || (lower === 'decline' && !!session.inviteDealId);
      if (isAcceptTap || isDeclineTap) {
        if (!session.inviteDealId) {
          const invite = await WhatsAppRepository.findPendingInvite(session.phone);
          if (invite) session.inviteDealId = invite.id;
        }
        if (session.inviteDealId) {
          if (isAcceptTap) await this.handleAcceptInvite(session, !!user);
          else await this.declineInvite(session, !!user);
          return;
        }
        // No pending invite for this number (stale button) - fall through.
      }

      if (!user) {
        await this.handleGuest(session, text);
        return;
      }

      // An operator/AML decision on the account outranks everything the channel
      // can offer - a frozen or suspended account transacts nowhere.
      if (!canAccountAct(user.status)) {
        await reply(
          session,
          `🚫 ${accountBlockedReason(user.status) ?? 'This account is not active.'}`,
        );
        return;
      }

      // `true` = this is an inbound message, which reopens their 24-hour window.
      const channel = await WhatsAppRepository.upsertChannel(
        user.id,
        message.phone,
        session.locale,
        true,
      );

      // LOCK is the panic switch: the number may be out of the owner's hands, so
      // the channel stops answering entirely - no balances, no deals, no
      // actions - until it is unlocked from the app (Settings → Security).
      // Honoured before any step-up window or PIN setting can bypass it.
      if (channel.locked && lower !== 'help' && lower !== 'aide') {
        session.flow = undefined;
        session.pending = undefined;
        session.awaitingPin = false;
        session.awaitingPinSetup = false;
        await WaSessionStore.save(session);
        await reply(
          session,
          '🔒 This WhatsApp channel is *locked*, so I can\'t show your account or act on it here.\n\nUnlock it in the BiZik app under *Settings → Security → WhatsApp*, then message me again.',
        );
        return;
      }

      // Global commands (work anywhere).
      if (lower === 'menu') {
        session.flow = undefined;
        session.pending = undefined;
        await sendMenu(session);
        return;
      }
      if (['hi', 'hello', 'hey', 'start', 'bonjour', 'salut', 'coucou', 'good morning', 'good evening', 'good afternoon'].includes(lower)) {
        session.flow = undefined;
        session.pending = undefined;
        await this.greet(session, user.fullName, lastSeenMs);
        return;
      }
      if (lower === 'help' || lower === 'aide') {
        const helpResult = await WhatsAppTools.run('get_help', {}, this.ctx(session));
        await reply(session, helpResult.kind === 'data' ? helpResult.content : 'Type MENU to begin.');
        return;
      }
      if (lower === 'cancel' || lower === 'annuler') {
        session.flow = undefined;
        session.pending = undefined;
        session.awaitingPin = false;
        session.awaitingPinSetup = false;
        await reply(session, 'Okay, cancelled. Type MENU to start again.');
        await WaSessionStore.save(session);
        return;
      }
      if (lower === 'lock') {
        await WhatsAppRepository.setLocked(user.id, true);
        session.flow = undefined;
        session.pending = undefined;
        session.awaitingPin = false;
        session.awaitingPinSetup = false;
        session.lastStepUpAt = undefined;
        await WaSessionStore.save(session);
        await reply(
          session,
          '🔒 Locked. This WhatsApp channel can no longer see or act on your BiZik account.\n\nUnlock it in the BiZik app under *Settings → Security → WhatsApp*.',
        );
        return;
      }
      if (lower === 'stop') {
        await WhatsAppRepository.setOptIn(user.id, false);
        await reply(session, 'You have opted out of BiZik WhatsApp messages. Send MENU anytime to opt back in.');
        return;
      }

      // Resend a pending deal invitation on WhatsApp.
      if (lower.startsWith('resend_')) {
        await this.resendInviteFor(session, text.trim().slice('resend_'.length));
        return;
      }
      if (
        lower === 'resend' ||
        lower === 'menu_resend' ||
        lower.includes('resend invite') ||
        lower.includes('resend invitation') ||
        lower.includes('resend the invite')
      ) {
        await this.handleResendInvite(session);
        return;
      }

      // Creator cancels a deal of theirs that hasn't been funded yet.
      if (lower.startsWith('canceldeal_')) {
        await this.cancelDealFor(session, text.trim().slice('canceldeal_'.length));
        return;
      }
      // A whole-deal cancellation is handled deterministically; anything about
      // a specific milestone (or merely mentioning cancellation) goes to the AI.
      if (!lower.includes('milestone') && !lower.includes('jalon') && looksLikeCancelRequest(text)) {
        await this.handleCancelDeal(session, text);
        return;
      }

      // KYC verification flow (deterministic - collects ID type, number, photos).
      if (session.flow?.name === 'kyc') {
        await this.handleKycFlow(session, message, text);
        return;
      }
      if (
        lower === 'verify' ||
        lower === 'menu_kyc' ||
        lower === 'menu_moreinfo' ||
        lower.includes('kyc') ||
        lower.includes('verify my account') ||
        lower.includes('provide more information')
      ) {
        await this.startKyc(session);
        return;
      }

      // Setting a new PIN.
      if (session.awaitingPinSetup) {
        await this.handlePinSetup(session, text);
        return;
      }
      // Entering a PIN to authorise a pending action.
      if (session.awaitingPin && session.pending) {
        await this.handlePinEntry(session, text);
        return;
      }
      // A pending action awaiting a confirm/cancel.
      if (session.pending) {
        if (YES.has(lower) || lower === 'confirm') {
          await this.confirmPending(session);
          return;
        }
        if (NO.has(lower)) {
          session.pending = undefined;
          await reply(session, 'Cancelled.');
          await WaSessionStore.save(session);
          return;
        }
        // Anything else falls through to the AI (they may be changing the request).
      }

      // Menu shortcuts.
      if (
        /^(my )?(handle|username|tag)\??$/.test(lower) ||
        lower === 'menu_receive' ||
        /^(mon )?(identifiant|pseudo)\??$/.test(lower)
      ) {
        const me = await TransferService.myHandle(user.id);
        await reply(
          session,
          `💰 *Your BiZik handle: @${me.username}*\n\nShare it with anyone who owes you money. They can send it straight to your wallet, from the app or right here on WhatsApp. No phone number needed.`,
        );
        return;
      }
      if (lower === 'menu_wallet' || lower === 'balance') {
        const result = await WhatsAppTools.run('get_balance', {}, this.ctx(session));
        await reply(session, result.kind === 'data' ? result.content : 'Could not read your balance.');
        return;
      }
      if (lower === 'menu_cancel') {
        await this.handleCancelDeal(session);
        return;
      }
      // "send 5000 to @handle" is the phrasing the menu advertises, so it is
      // handled here rather than by the model: it must keep working when the
      // provider is down, and it costs nothing when it is up.
      const send = parseSendMoney(text);
      if (send) {
        await this.handleParsedSend(session, user.id, send);
        return;
      }

      // Adding your own money is likewise unambiguous - and it is the answer to
      // "my wallet is empty", so it must not depend on the model being up.
      const deposit = parseDeposit(text);
      if (deposit) {
        await this.handleParsedDeposit(session, deposit);
        return;
      }

      // Reading your own deals works in every account state - never gate it,
      // and never let it depend on the model picking the right tool.
      if (lower === 'menu_deals' || looksLikeDealListRequest(text)) {
        const result = await WhatsAppTools.run('list_my_deals', {}, this.ctx(session));
        await reply(session, result.kind === 'data' ? result.content : 'Could not read your deals.');
        return;
      }
      if (lower === 'menu_help') {
        const result = await WhatsAppTools.run('get_help', {}, this.ctx(session));
        await reply(session, result.kind === 'data' ? result.content : 'Type MENU to begin.');
        return;
      }
      // Deal/fund/withdraw menu taps → let the AI drive the collection.
      const menuSeed: Record<string, string> = {
        menu_deal: 'I want to start a new deal.',
        menu_fund: 'I want to fund/pay one of my deals.',
        menu_withdraw: 'I want to withdraw money.',
      };
      if (menuSeed[lower]) text = menuSeed[lower];

      // ---- AI turn ----
      if (!text) {
        await sendMenu(session);
        return;
      }
      if (!WhatsAppAI.available()) {
        await reply(session, 'The assistant is not configured yet. Type MENU to use the menu.');
        return;
      }
      // Plainly not our business - answered here, so it costs nothing and can
      // never be talked into an answer.
      if (isClearlyOutOfScope(text)) {
        await reply(session, outOfScopeReply(session.locale));
        session.history.push({ role: 'user', content: text });
        session.history.push({ role: 'assistant', content: outOfScopeReply(session.locale) });
        await WaSessionStore.save(session);
        return;
      }

      const budget = await WhatsAppBudget.consumeTurn(user.id);
      if (budget !== 'ok') {
        await reply(session, WhatsAppBudget.message(budget));
        await sendMenu(session);
        await WaSessionStore.save(session);
        return;
      }
      const turn = await WhatsAppAI.handleTurn(text, toAnthropicHistory(session), this.ctx(session));
      session.history.push({ role: 'user', content: text });

      if (turn.pending) {
        // Creating a deal requires a verified account (paying does NOT). Tell
        // them upfront and start verification - the deal resumes after KYC.
        if (GATED_TOOLS.has(turn.pending.tool) && needsKycForDeal(user.kycTier)) {
          const refusal = kycRefusalFor(turn.pending.tool);
          await reply(session, refusal);
          await this.startKyc(session);
          // The model MUST see that this was refused. Without it, its context
          // still shows an un-answered proposal, so it re-proposes the same
          // action on the user's NEXT message - whatever they actually asked -
          // and every reply becomes this same refusal.
          rememberRefusal(session, turn.pending.tool, refusal);
          await WaSessionStore.save(session);
          return;
        }
        // The same action that just failed, proposed again while the user is
        // still talking about the failure - hold it back and say what happened.
        if (shouldSuppressRepeat(turn.pending, session.lastFailedAction, text)) {
          const failure = session.lastFailedAction!;
          const balanceIssue = /balance|insufficient|fund/i.test(failure.message);
          const tip = balanceIssue
            ? '\n\nTo add money, top up in the BiZik app (*Wallet → Add money*) via Mobile Money or bank, then reply *try again*.'
            : '\n\nWhen you\'re ready, reply *try again*, or tell me to use a different payment source.';
          await reply(session, `I haven't re-sent that. It failed a moment ago:\n\n_${failure.message}_${tip}`);
          await WaSessionStore.save(session);
          return;
        }
        if (asksToRetry(text)) session.lastFailedAction = undefined;
        session.pending = turn.pending;
        // Money actions may require a PIN - set one up first if missing.
        if (turn.pending.requiresPin && config.whatsapp.requirePin && !(await WhatsAppSecurity.hasPin(user.id))) {
          session.awaitingPinSetup = true;
          await reply(session, `${turn.pending.summary}\n\nFirst, create a 4 to 6 digit BiZik PIN (reply with the digits). You'll use it to approve money actions.`);
        } else {
          await sendConfirm(session, turn.pending.summary);
        }
      } else if (turn.unavailable) {
        // The model is unreachable - admit it and point at everything that
        // still works, instead of implying the user phrased something badly.
        await reply(
          session,
          '⚠️ I can\'t understand free-form messages at the moment. My assistant service is unavailable.\n\nEverything important still works if you use these exact words:\n\n• *send 5000 to @handle*\n• *my deals*\n• *my balance* / *my handle*\n• *cancel deal*\n• *verify*\n• *MENU*',
        );
      } else if (turn.text) {
        // Last line of defence: whatever the model produced, what leaves this
        // service has to be about BiZik.
        // The model writes the free-form replies, so it is the one that needs
        // its decoration taken off; our own strings keep their status glyph.
        const outbound = replyLeftScope(turn.text)
          ? outOfScopeReply(session.locale)
          : stripEmoji(turn.text);
        session.history.push({ role: 'assistant', content: outbound });
        await reply(session, outbound);
      } else {
        await sendMenu(session);
      }
      await WaSessionStore.save(session);
    } catch (error) {
      console.error('[whatsapp] handleInbound error', (error as Error).message);
      await reply(session, 'Sorry, something went wrong. Type MENU to try again.');
    }
  },

  ctx(session: WaSession): ToolContext {
    return { userId: session.userId as string, locale: session.locale };
  },

  /**
   * Greeting handler. After a real gap (first hello of the day / been a while),
   * warmly welcome the user back and remind them what they can do, then show
   * the menu. If they were active recently, just show the menu.
   */
  async greet(session: WaSession, fullName: string, lastSeenMs: number): Promise<void> {
    const WELCOME_BACK_GAP_MS = 6 * 60 * 60 * 1000; // 6 hours
    const firstName = (fullName || '').trim().split(/\s+/)[0] || 'there';
    const beenAwhile = lastSeenMs === 0 || Date.now() - lastSeenMs > WELCOME_BACK_GAP_MS;
    if (beenAwhile) {
      await reply(
        session,
        `👋 *Welcome back, ${firstName}!* Good to see you again.`,
      );
    }
    await sendMenu(session);
    await WaSessionStore.save(session);
  },

  // ---- One-time welcome (first-ever contact) ----
  async welcomeAndProceed(session: WaSession, hasAccount: boolean): Promise<void> {
    await sendWelcome(session);
    const invite = await WhatsAppRepository.findPendingInvite(session.phone);
    if (invite) {
      session.inviteDealId = invite.id;
      await WhatsAppClient.sendButtons(
        session.phone,
        `👋 This is *BiZik* messaging on behalf of *${invite.creatorName}*.\n\nThey've invited you to a secure deal:\n\n• ${invite.title}\n• ${money(invite.amount, invite.currency)}\n\nBiZik is a neutral escrow: we hold the money safely until the deal is delivered and approved, so no one gets scammed. Accept or decline?`,
        [
          { id: 'accept_deal', title: 'Accept deal' },
          { id: 'decline_deal', title: 'Decline' },
        ],
      );
      await WaSessionStore.save(session);
      return;
    }
    // Only account holders reach this point: a guest without an invite is
    // introduced by the front desk instead (see handleInbound / handleGuest).
    if (hasAccount) await sendMenu(session);
    await WaSessionStore.save(session);
  },

  // ---- Deal-invitation accept (create account first if needed) ----
  async handleAcceptInvite(session: WaSession, hasAccount: boolean): Promise<void> {
    const dealId = session.inviteDealId;
    if (!dealId) {
      await sendMenu(session);
      return;
    }
    if (hasAccount) {
      await this.acceptDeal(session, session.userId as string, dealId);
      await WaSessionStore.save(session);
      return;
    }
    // Not on the platform yet - collect THEIR OWN name (their master account
    // name, not whatever the inviter called them), then accept the deal.
    const language = guestLocale(session);
    session.flow = { name: 'onboard', step: 'name', data: { acceptDealId: dealId, language } };
    // From here their reply goes through the front desk, so a question ("is this
    // safe?", "who is this?") is answered rather than taken as their name.
    await this.guestSay(session, guestCopy(language).askFullNameForInvite);
  },

  async acceptDeal(session: WaSession, userId: string, dealId: string): Promise<void> {
    try {
      await ContractService.accept(userId, dealId);
      session.inviteDealId = undefined;

      // Part 1 - notify the inviter that their invitee accepted.
      const accepter = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      void WhatsAppNotify.dealAccepted(dealId, accepter?.fullName ?? undefined);

      // Part 3 - guide THIS user to their next step on the deal (don't dump the
      // main menu). Only the buyer/payer can fund; the seller waits + delivers.
      let nextStep = 'It\'s now active. Say "my deals" anytime to see it.';
      try {
        const deal = (await ContractService.byId(userId, dealId)) as { viewerRole?: string };
        nextStep =
          deal.viewerRole === 'client'
            ? 'You\'re the *buyer* here. The next step is to *fund* it so work can start. Ready? Just say "fund this deal".'
            : 'You\'re the *seller* here. Once the buyer funds the escrow, deliver the work and you\'ll be paid. I\'ll let you know the moment it\'s funded.';
      } catch {
        /* fall back to the generic next step */
      }
      await reply(session, `✅ You\'ve accepted the deal. ${nextStep}`);
    } catch (error) {
      await reply(session, `Could not accept the deal: ${(error as Error).message}`);
    }
  },

  /** Invitee declines → the deal is cancelled and the creator is notified. */
  async declineInvite(session: WaSession, hasAccount: boolean): Promise<void> {
    const dealId = session.inviteDealId;
    if (!dealId) {
      await sendMenu(session);
      return;
    }
    try {
      if (hasAccount) {
        await ContractService.decline(session.userId as string, dealId);
      } else {
        await ContractService.declineByPhone(session.phone, dealId);
      }
      const declinerName = session.userId
        ? (await prisma.user.findUnique({ where: { id: session.userId }, select: { fullName: true } }))?.fullName
        : undefined;
      void WhatsAppNotify.dealDeclined(dealId, declinerName ?? undefined);
      session.inviteDealId = undefined;
      await reply(
        session,
        'Okay, you\'ve *declined* this invitation, so the deal has been cancelled. The person who invited you has been notified.',
      );
    } catch (error) {
      await reply(session, `Could not decline the deal: ${(error as Error).message}`);
    }
    await WaSessionStore.save(session);
  },

  // ---- Resend a pending deal invitation (creator side) ----
  /** List the creator's pending invites; resend if there's exactly one. */
  async handleResendInvite(session: WaSession): Promise<void> {
    if (!session.userId) {
      await reply(session, 'Create an account first, then you can invite people to deals.');
      return;
    }
    const invites = await WhatsAppRepository.pendingInvitesByCreator(session.userId);
    if (invites.length === 0) {
      await reply(
        session,
        'You have no pending invitations to resend. (Deals that were accepted or declined/cancelled can\'t be re-invited. Start a new deal instead.)',
      );
      return;
    }
    if (invites.length === 1) {
      await this.resendInviteFor(session, invites[0].id);
      return;
    }
    const rows: ListRow[] = invites.slice(0, 10).map((invite) => ({
      id: `resend_${invite.id}`,
      title: (invite.counterpartyName ?? 'Invited user').slice(0, 24),
      description: `${invite.title} · ${money(invite.amount, invite.currency)}`,
    }));
    await WhatsAppClient.sendList(
      session.phone,
      'Which deal\'s invitation should I resend?',
      'Choose',
      rows,
      'Pending invites',
    );
  },

  /** Resend the invite for one specific deal (validates it's still pending). */
  async resendInviteFor(session: WaSession, dealId: string): Promise<void> {
    if (!session.userId) return;
    // Guard: the deal must belong to this creator and still be pending.
    const owned = await WhatsAppRepository.pendingInvitesByCreator(session.userId);
    const invite = owned.find((candidate) => candidate.id === dealId);
    if (!invite) {
      await reply(
        session,
        'That deal isn\'t awaiting a response. It was already accepted, or declined/cancelled. You can\'t resend its invitation.',
      );
      return;
    }
    const result = await WhatsAppNotify.dealInvite(dealId, { resend: true });
    if (result.ok && result.delivered) {
      await reply(session, `📨 Reminder sent to *${invite.counterpartyName ?? 'your invitee'}* on WhatsApp for "${invite.title}".`);
    } else if (result.ok) {
      await reply(
        session,
        `*${invite.counterpartyName ?? 'Your invitee'}* still isn\'t reachable on WhatsApp. They\'ve had an SMS invite. Try again once they\'re on WhatsApp.`,
      );
    } else {
      await reply(session, 'That invitation can no longer be resent.');
    }
  },

  /**
   * A transfer the user stated plainly ("send 5000 to @maxime.ti"). Resolution,
   * the KYC gate, the confirmation and the PIN all run exactly as they do when
   * the model proposes it - this only skips the model's parsing step.
   */
  async handleParsedSend(
    session: WaSession,
    userId: string,
    send: { to: string; amount: number; currency?: string },
  ): Promise<void> {
    const recipient = await TransferService.resolveRecipient(send.to);
    if (!recipient) {
      await reply(
        session,
        `I couldn't find a BiZik account for *${send.to}*.\n\nCheck the handle (like @maxime.ti) or send their phone number instead.`,
      );
      return;
    }
    if (recipient.id === userId) {
      await reply(session, "That's your own handle. Send it to someone else's.");
      return;
    }

    // No currency named: use the one their own money is in.
    const owner = await prisma.user.findUnique({
      where: { id: userId },
      select: { country: true },
    });
    const currency = send.currency ?? homeCurrencyFor(owner?.country);

    const result = await WhatsAppTools.run(
      'send_money',
      { to: send.to, amount: send.amount, currency },
      this.ctx(session),
    );
    if (result.kind === 'propose') {
      await this.presentPending(session, result.pending);
      await WaSessionStore.save(session);
      return;
    }
    await reply(
      session,
      result.kind === 'error' ? result.message : 'I could not set up that transfer.',
    );
  },

  /**
   * A wallet top-up the user asked for plainly. Without an amount we ask for one
   * rather than guessing; with one, the normal propose + PIN flow takes over.
   */
  async handleParsedDeposit(
    session: WaSession,
    deposit: { amount?: number; currency?: string },
  ): Promise<void> {
    if (!deposit.amount) {
      await reply(
        session,
        'How much would you like to add to your wallet? Reply with the amount, for example *deposit 5000*.',
      );
      return;
    }
    const result = await WhatsAppTools.run(
      'deposit_to_wallet',
      { amount: deposit.amount, ...(deposit.currency ? { currency: deposit.currency } : {}) },
      this.ctx(session),
    );
    if (result.kind === 'propose') {
      await this.presentPending(session, result.pending);
      await WaSessionStore.save(session);
      return;
    }
    // The tool's errors are written for the model; give the user the practical
    // version - the only one they can act on is "tell me which number".
    await reply(
      session,
      result.kind === 'error' && /no saved mobile money/i.test(result.message)
        ? 'Which Mobile Money number should I charge? Reply with the number, for example *deposit 5000 from 677123456*.'
        : result.kind === 'error'
          ? result.message
          : 'I could not set up that deposit.',
    );
  },

  // ---- Cancel a deal the user created (creator side) ----
  /**
   * List the deals this creator can still cancel - anything of theirs that has
   * not been funded, accepted or not. Cancels straight away when there is only
   * one, or when the message named a deal by its QTQ reference.
   */
  async handleCancelDeal(session: WaSession, text?: string): Promise<void> {
    if (!session.userId) {
      await reply(session, 'Create an account first before managing deals.');
      return;
    }
    // "cancel QTQ-20260823-A8CB99" -> cancel exactly that deal.
    const referenced = dealRefIn(text ?? '');
    if (referenced) {
      await this.cancelDealFor(session, referenced);
      return;
    }
    const deals = await WhatsAppRepository.cancellableDealsByCreator(session.userId);
    if (deals.length === 0) {
      await reply(session, await noCancellableDealsMessage(session.userId));
      return;
    }
    if (deals.length === 1) {
      await this.cancelDealFor(session, deals[0].id);
      return;
    }
    const rows: ListRow[] = deals.slice(0, 10).map((deal) => ({
      id: `canceldeal_${deal.id}`,
      title: deal.title.slice(0, 24),
      description: `${money(deal.amount, deal.currency)} - ${deal.counterpartyName ?? deal.counterpartyPhone ?? 'invited user'}`,
    }));
    await WhatsAppClient.sendList(
      session.phone,
      'Which deal should I cancel?',
      'Choose',
      rows,
      'Your deals',
    );
  },

  /**
   * Ask the creator to confirm cancelling one specific deal. Cancelling can't be
   * undone, so it goes through the same confirm-then-execute path as the money
   * actions (ContractService re-checks the rules when it actually runs).
   */
  async cancelDealFor(session: WaSession, dealId: string): Promise<void> {
    if (!session.userId) return;
    const deals = await WhatsAppRepository.cancellableDealsByCreator(session.userId);
    const deal = deals.find((candidate) => candidate.id === dealId);
    if (!deal) {
      await reply(session, await cancelRefusalFor(session.userId, dealId));
      return;
    }
    const withWhom = deal.counterpartyName ?? deal.counterpartyPhone ?? 'your invitee';
    session.pending = {
      tool: 'cancel_deal',
      args: { deal_id: deal.id },
      summary:
        `Cancel the deal *${deal.title}* (${money(deal.amount, deal.currency)}) with ${withWhom}?` +
        '\n\n' +
        'This cannot be undone - a cancelled deal cannot be revived or re-invited.',
      // Destructive and irreversible: step up before it runs.
      requiresPin: true,
    };
    await sendConfirm(session, session.pending.summary);
    await WaSessionStore.save(session);
  },

  // ---- Guests: numbers with no BiZik account yet ----

  /**
   * Every message from someone without an account lands here. Unambiguous taps
   * (a country picked from the list, the Terms buttons, a typed "I agree") are
   * handled directly; everything else is read by the model first, so a question
   * gets an answer, a French speaker gets French, and nothing becomes an account
   * name unless it plainly IS a name.
   */
  async handleGuest(session: WaSession, text: string, opts: { firstContact?: boolean } = {}): Promise<void> {
    const flow = onboardFlow(session);
    const lower = text.trim().toLowerCase();

    // A country tapped from the list is unambiguous.
    if (flow?.step === 'country' && lower.startsWith('country_')) {
      const country = resolveCountry(text);
      if (country) {
        await this.guestSetCountry(session, flow, country);
        return;
      }
    }
    // Terms: the buttons, or an explicit typed acceptance. Consent is a legal
    // record, so it is never left to the model's interpretation.
    if (flow?.step === 'consent') {
      if (lower === 'onboard_decline') {
        await this.guestStopSignup(session, guestCopy(guestLocale(session)).declined);
        return;
      }
      if (isExplicitAgreement(text)) {
        await this.completeSignup(session, flow, text);
        return;
      }
    }

    // Cost ceiling for unknown numbers too - they are the ones most likely to be
    // abuse. Over budget, the deterministic flow still works.
    const budget = await WhatsAppBudget.consumeTurn(`guest:${session.phone}`);
    const understood =
      budget === 'ok'
        ? await WhatsAppAI.understandGuest(
            text || '(They sent something without text, for example a photo or a voice note that could not be transcribed.)',
            toAnthropicHistory(session),
            { ...guestState(flow), firstContact: opts.firstContact },
          )
        : ({ unavailable: true } as const);

    if ('unavailable' in understood) {
      await this.guestFallback(session, flow, text, !!opts.firstContact);
      return;
    }

    const decision = understood.decision;
    session.locale = decision.language;
    if (flow) flow.data.language = decision.language;
    const copy = guestCopy(decision.language);
    session.history.push({ role: 'user', content: text || '(no text)' });

    switch (decision.intent) {
      case 'cancel_signup': {
        await this.guestStopSignup(session, decision.reply || copy.declined);
        return;
      }

      case 'give_country': {
        // Naming a country outside signup ("do you work in Nigeria?") is a
        // question, not a request to open an account.
        if (!onboardFlow(session)) {
          await this.guestSay(session, decision.reply || copy.howCanIHelp);
          return;
        }
        await this.guestAdvanceSignup(session, decision);
        return;
      }

      case 'start_signup':
      case 'give_name': {
        await this.guestAdvanceSignup(session, decision);
        return;
      }

      default: {
        // A question, a greeting, anything else: just answer it.
        await this.guestSay(session, decision.reply || copy.howCanIHelp);
      }
    }
  },

  /**
   * Move signup forward with whatever this message validly supplied. The model
   * may tag "I'm Amina Okafor from Cameroon, sign me up" as start_signup with
   * both fields filled, so every signup intent saves any valid name AND country
   * it carries, then asks only for what is still missing.
   */
  async guestAdvanceSignup(session: WaSession, decision: GuestDecision): Promise<void> {
    const copy = guestCopy(decision.language);
    const active = onboardFlow(session) ?? startOnboardFlow(session, decision.language);

    const name = cleanPersonName(decision.fullName);
    const nameRejected = !!decision.fullName && !looksLikePersonName(name);
    if (decision.fullName && !nameRejected) active.data.fullName = name;

    const country = decision.country ? resolveCountry(decision.country) : null;
    if (country) active.data.country = country;

    if (!active.data.fullName) {
      active.step = 'name';
      // A "name" that does not read like one is asked for again, never stored:
      // that is how "How" and "Je" became account names.
      await this.guestSay(session, nameRejected ? copy.notAName : decision.reply || copy.askFullName);
      return;
    }
    if (!active.data.country) {
      active.step = 'country';
      if (decision.country && !country) {
        // They named a country BiZik does not serve (or we could not match it).
        await this.guestSay(session, decision.reply || copy.pickCountry);
        await this.guestAskCountry(session, copy.pickCountry);
        return;
      }
      await this.guestAskCountry(session, copy.askCountry(String(active.data.fullName).split(/\s+/)[0]));
      return;
    }
    active.step = 'consent';
    await this.guestSendConsent(session, String(active.data.country));
  },

  /** Say something to a guest, remember it for the next turn, and save. */
  async guestSay(session: WaSession, text: string): Promise<void> {
    const outbound = replyLeftScope(text) ? outOfScopeReply(guestLocale(session)) : stripEmoji(text);
    session.history.push({ role: 'assistant', content: outbound });
    await reply(session, outbound);
    await WaSessionStore.save(session);
  },

  async guestAskCountry(session: WaSession, prompt: string): Promise<void> {
    const copy = guestCopy(guestLocale(session));
    await WhatsAppClient.sendList(session.phone, prompt, copy.countryButton, countryRows(), copy.countrySection);
    session.history.push({ role: 'assistant', content: prompt });
    await WaSessionStore.save(session);
  },

  async guestSetCountry(
    session: WaSession,
    flow: NonNullable<ReturnType<typeof onboardFlow>>,
    country: string,
  ): Promise<void> {
    flow.data.country = country;
    if (!flow.data.fullName) {
      flow.step = 'name';
      await this.guestSay(session, guestCopy(guestLocale(session)).askFullName);
      return;
    }
    flow.step = 'consent';
    await this.guestSendConsent(session, country);
  },

  async guestSendConsent(session: WaSession, country: string): Promise<void> {
    const copy = guestCopy(guestLocale(session));
    const body = copy.consent(country, legalLinks.terms, legalLinks.privacy);
    await WhatsAppClient.sendButtons(session.phone, body, [
      { id: 'onboard_agree', title: copy.agreeButton },
      { id: 'onboard_decline', title: copy.declineButton },
    ]);
    session.history.push({ role: 'assistant', content: body });
    await WaSessionStore.save(session);
  },

  async guestStopSignup(session: WaSession, message: string): Promise<void> {
    session.flow = undefined;
    await this.guestSay(session, message);
  },

  /**
   * The model is unreachable or over budget. Keep signup working with fixed
   * steps, but never accept a greeting or a question as somebody's name.
   */
  async guestFallback(
    session: WaSession,
    flow: ReturnType<typeof onboardFlow>,
    text: string,
    firstContact: boolean,
  ): Promise<void> {
    const copy = guestCopy(guestLocale(session));
    const lower = text.trim().toLowerCase();
    if (!flow) {
      if (firstContact) await sendWelcome(session);
      startOnboardFlow(session, guestLocale(session));
      await this.guestSay(session, firstContact ? copy.askFullName : copy.assistantDown);
      return;
    }
    if (flow.step === 'name') {
      const name = cleanPersonName(text);
      if (!looksLikePersonName(name)) {
        await this.guestSay(session, copy.notAName);
        return;
      }
      flow.data.fullName = name;
      if (flow.data.country) {
        await this.guestSetCountry(session, flow, String(flow.data.country));
        return;
      }
      flow.step = 'country';
      await this.guestAskCountry(session, copy.askCountry(name.split(/\s+/)[0]));
      return;
    }
    if (flow.step === 'country') {
      const country = resolveCountry(text);
      if (country) await this.guestSetCountry(session, flow, country);
      else await this.guestAskCountry(session, copy.pickCountry);
      return;
    }
    // Consent: explicit acceptance was handled before the model was asked.
    if (NO.has(lower)) {
      await this.guestStopSignup(session, copy.declined);
      return;
    }
    await this.guestSay(session, copy.consentReminder(legalLinks.terms, legalLinks.privacy));
  },

  /** Terms accepted: create the account, record consent, then carry on. */
  async completeSignup(
    session: WaSession,
    flow: NonNullable<ReturnType<typeof onboardFlow>>,
    consentText: string,
  ): Promise<void> {
    const locale = guestLocale(session);
    const copy = guestCopy(locale);

    // Same gate the app's signup honours - a paused platform pauses here too.
    if (!systemSettings().general.signupsEnabled) {
      await this.guestStopSignup(session, copy.signupsPaused);
      return;
    }

    const name = String(flow.data.fullName ?? '').trim();
    const country = String(flow.data.country ?? '');
    if (!name || !country) {
      // Should not happen (consent is only asked once both are known), but never
      // create a nameless or countryless account if it does.
      flow.step = name ? 'country' : 'name';
      if (name) await this.guestAskCountry(session, copy.pickCountry);
      else await this.guestSay(session, copy.askFullName);
      return;
    }

    // The language they actually chatted in wins; the country's default applies
    // only if we never learned it.
    const accountLocale =
      (flow.data.language as GuestLocale | undefined) ??
      (localeForCountry(country) === 'fr' ? 'fr' : systemSettings().general.defaultLocale);
    const existing = await prisma.user.findUnique({ where: { phone: session.phone } });
    const created =
      existing ??
      (await prisma.user.create({
        data: {
          phone: session.phone,
          fullName: name,
          // The number is proven by the fact they messaged us from it.
          phoneVerified: true,
          status: 'ACTIVE',
          country,
          locale: accountLocale,
          termsAcceptedAt: new Date(),
          signupSource: 'whatsapp',
        },
      }));
    session.locale = (accountLocale === 'fr' ? 'fr' : 'en');
    if (!existing) await provisionUserWallets(created);
    // Their public handle, so others can send them money by name.
    await UsernameService.ensureFor(created.id, created.fullName).catch(() => undefined);
    await WhatsAppRepository.upsertChannel(created.id, session.phone, session.locale);
    session.userId = created.id;

    // Durable legal record of the Terms + Privacy acceptance (the exact message
    // they sent, the channel, and the document versions/links they agreed to).
    const consentMessage =
      consentText.trim().toLowerCase() === 'onboard_agree'
        ? `${copy.agreeButton} (tapped the "${copy.agreeButton}" button)`
        : consentText.trim();
    await recordConsent({
      userId: created.id,
      channel: 'whatsapp',
      phone: session.phone,
      message: consentMessage,
    });

    const acceptDealId = flow.data.acceptDealId as string | undefined;
    session.flow = undefined;
    await reply(session, copy.accountReady(name));
    if (acceptDealId) {
      // They came here to accept a deal invitation - do it now.
      await this.acceptDeal(session, created.id, acceptDealId);
    } else {
      const invite = await WhatsAppRepository.findPendingInvite(session.phone);
      if (invite) {
        session.inviteDealId = invite.id;
        await WhatsAppClient.sendButtons(
          session.phone,
          `👋 BiZik here. *${invite.creatorName}* invited you to the deal *${invite.title}* (${money(invite.amount, invite.currency)}). The money is held safely in escrow until it's delivered and approved. Accept it?`,
          [
            { id: 'accept_deal', title: 'Accept deal' },
            { id: 'decline_deal', title: 'Decline' },
          ],
        );
      } else {
        await sendMenu(session);
      }
    }
    await WaSessionStore.save(session);
  },

  // ---- KYC verification (in chat) ----
  /** State-aware entry: explains status, or starts/resumes document collection. */
  async startKyc(session: WaSession): Promise<void> {
    const userId = session.userId as string;
    const state = await WhatsAppRepository.getKycState(
      userId,
      systemSettings().verification.standardTier,
    );
    if (state === 'verified') {
      await reply(session, '✅ You\'re already verified, nothing to do. Type MENU.');
      await WaSessionStore.save(session);
      return;
    }
    if (state === 'processing') {
      await reply(
        session,
        'Your verification is *under review*. We\'ll message you here as soon as there\'s a result. No need to resubmit. Meanwhile you can check your wallet, view deals, or pay a deal.',
      );
      await WaSessionStore.save(session);
      return;
    }
    if (state === 'more_info') {
      const reason = (await WhatsAppRepository.getLatestKycReason(userId)) ?? '';
      const detail = reason.replace('More documents needed:', '').trim();
      await reply(
        session,
        `📎 We need a bit more to verify you:\n${detail || 'clearer / additional documents'}\n\nLet's redo your documents.`,
      );
    }
    await this.beginKycFlow(session);
  },

  /** Start collecting the KYC documents (ID type → number → front → back → selfie). */
  async beginKycFlow(session: WaSession): Promise<void> {
    session.flow = { name: 'kyc', step: 'idType', data: {} };
    await WhatsAppClient.sendList(
      session.phone,
      '🪪 Let\'s verify your account. Choose your ID type:',
      'ID type',
      ID_TYPE_ROWS,
      'Verify',
    );
    await WaSessionStore.save(session);
  },

  /** Present an AI money proposal: KYC-gate create_deal, PIN-setup, or confirm. */
  async presentPending(session: WaSession, pending: PendingAction): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: session.userId as string },
      select: { id: true, kycTier: true },
    });
    if (!user) {
      await sendMenu(session);
      return;
    }
    if (GATED_TOOLS.has(pending.tool) && needsKycForDeal(user.kycTier)) {
      const refusal = kycRefusalFor(pending.tool);
      await reply(session, refusal);
      rememberRefusal(session, pending.tool, refusal);
      await this.startKyc(session);
      return;
    }
    session.pending = pending;
    if (pending.requiresPin && config.whatsapp.requirePin && !(await WhatsAppSecurity.hasPin(user.id))) {
      session.awaitingPinSetup = true;
      await reply(session, `${pending.summary}\n\nFirst, create a 4 to 6 digit BiZik PIN (reply with the digits). You'll use it to approve money actions.`);
    } else {
      await sendConfirm(session, pending.summary);
    }
  },

  /**
   * Handle a message that arrived DURING a step-by-step flow but isn't that
   * step's input - the "AI takes precedence over the bot" behaviour. Runs the
   * message through the AI: an informational answer is delivered and the flow
   * resumes (`resume`); a real money action switches away from the flow and is
   * proposed for confirmation (except create_deal, which needs verification -
   * so we keep collecting instead of looping).
   */
  async handleFlowAside(session: WaSession, text: string, resume: () => Promise<void>): Promise<void> {
    if (!text || !WhatsAppAI.available()) {
      await resume();
      await WaSessionStore.save(session);
      return;
    }
    if (isClearlyOutOfScope(text)) {
      await reply(session, outOfScopeReply(session.locale));
      await resume();
      await WaSessionStore.save(session);
      return;
    }

    const budget = await WhatsAppBudget.consumeTurn(session.userId as string);
    if (budget !== 'ok') {
      await reply(session, WhatsAppBudget.message(budget));
      await resume();
      await WaSessionStore.save(session);
      return;
    }
    const turn = await WhatsAppAI.handleTurn(text, toAnthropicHistory(session), this.ctx(session));
    session.history.push({ role: 'user', content: text });

    if (turn.pending) {
      if (turn.text) {
        session.history.push({ role: 'assistant', content: turn.text });
        await reply(session, turn.text);
      }
      if (turn.pending.tool === 'create_deal') {
        // They're mid-verification (or need it) - finish that, don't loop.
        await reply(session, "Let's finish your verification first, then I'll set up that deal.");
        await resume();
        await WaSessionStore.save(session);
        return;
      }
      // A different action they can do now (fund/withdraw/… - no KYC needed):
      // leave the step-by-step flow and honour it.
      session.flow = undefined;
      await this.presentPending(session, turn.pending);
      await WaSessionStore.save(session);
      return;
    }

    if (turn.text) {
      session.history.push({ role: 'assistant', content: turn.text });
      await reply(session, turn.text);
    }
    await resume();
    await WaSessionStore.save(session);
  },

  /** Re-ask for the current KYC step after handling an aside. */
  async repromptKyc(session: WaSession, step: string): Promise<void> {
    switch (step) {
      case 'idType':
        await WhatsAppClient.sendList(session.phone, '🪪 Back to verification. Choose your ID type:', 'ID type', ID_TYPE_ROWS, 'Verify');
        break;
      case 'idNumber':
        await reply(session, '🪪 When you\'re ready, reply with your *ID number* to continue (or CANCEL to stop).');
        break;
      case 'idFront':
        await reply(session, '📷 When you\'re ready, send a photo of your *ID front* (or CANCEL to stop).');
        break;
      case 'idBack':
        await reply(session, '📷 Send a photo of the *back* of your ID, or reply SKIP (or CANCEL to stop).');
        break;
      case 'selfie':
        await reply(session, '🤳 Send a *selfie holding your ID* to continue (or CANCEL to stop).');
        break;
      default:
        break;
    }
  },

  async handleKycFlow(session: WaSession, message: InboundMessage, text: string): Promise<void> {
    const flow = session.flow;
    if (!flow) return;

    // AI PRECEDENCE over the step-by-step bot: if this message isn't the input
    // the current step is waiting for (a photo, an ID number, an ID-type pick),
    // it's probably a different request - let the AI analyze and act on it, then
    // resume collecting where we left off. Photos and skip/cancel stay as input.
    if (!isKycStepInput(flow.step, message, text)) {
      await this.handleFlowAside(session, text, () => this.repromptKyc(session, flow.step));
      return;
    }

    const downloadImage = async (): Promise<string | null> => {
      if (message.kind !== 'image' || !message.mediaId) return null;
      const media = await WhatsAppClient.downloadMedia(message.mediaId);
      if (!media) return null;
      return `data:${media.mimeType};base64,${media.bytes.toString('base64')}`;
    };

    switch (flow.step) {
      case 'idType': {
        const raw = text.trim().toUpperCase();
        const valid = ['NATIONAL_ID', 'PASSPORT', 'DRIVERS_LICENSE', 'VOTERS_CARD'];
        let idType = raw.startsWith('KYC_ID_') ? raw.slice(7) : '';
        if (!idType) {
          if (raw.includes('PASS')) idType = 'PASSPORT';
          else if (raw.includes('NATION') || raw === 'ID') idType = 'NATIONAL_ID';
          else if (raw.includes('DRIV') || raw.includes('LICEN')) idType = 'DRIVERS_LICENSE';
          else if (raw.includes('VOTER')) idType = 'VOTERS_CARD';
        }
        if (!valid.includes(idType)) {
          await WhatsAppClient.sendList(session.phone, 'Please pick your ID type:', 'ID type', ID_TYPE_ROWS, 'Verify');
          return;
        }
        flow.data.idType = idType;
        flow.step = 'idNumber';
        await reply(session, 'Enter your ID number (for testing, any number works, but avoid the words FAIL or REVIEW).');
        await WaSessionStore.save(session);
        return;
      }
      case 'idNumber': {
        const num = text.trim();
        if (num.length < 4) {
          await reply(session, 'That ID number looks too short. Please re-enter it.');
          return;
        }
        flow.data.idNumber = num;
        flow.step = 'idFront';
        await reply(session, '📷 Now send a clear PHOTO of the FRONT of your ID.');
        await WaSessionStore.save(session);
        return;
      }
      case 'idFront': {
        const image = await downloadImage();
        if (!image) {
          await reply(session, 'Please send a *photo* of your ID front (attach an image).');
          return;
        }
        flow.data.idFront = image;
        flow.step = 'idBack';
        await reply(session, '📷 Good. Now send a PHOTO of the BACK of your ID.\n(If your ID has no back, a passport for example, reply *SKIP*.)');
        await WaSessionStore.save(session);
        return;
      }
      case 'idBack': {
        if (text.trim().toLowerCase() === 'skip') {
          flow.step = 'selfie';
          await reply(session, '🤳 No problem. Finally, send a SELFIE of your face holding your ID.');
          await WaSessionStore.save(session);
          return;
        }
        const image = await downloadImage();
        if (!image) {
          await reply(session, 'Please send a *photo* of the BACK of your ID, or reply *SKIP* if it has none.');
          return;
        }
        flow.data.idBack = image;
        flow.step = 'selfie';
        await reply(session, '🤳 Great. Finally, send a SELFIE of your face holding your ID.');
        await WaSessionStore.save(session);
        return;
      }
      case 'selfie': {
        const image = await downloadImage();
        if (!image) {
          await reply(session, 'Please send a *selfie photo* of your face (holding your ID).');
          return;
        }
        await reply(session, 'Submitting your verification…');
        try {
          const owner = await prisma.user.findUnique({
            where: { id: session.userId as string },
            select: { country: true },
          });
          const ownerCountry = owner?.country === 'CM' ? 'Cameroon' : owner?.country;
          await KycService.submit(session.userId as string, {
            country: ownerCountry || 'Cameroon',
            phone: session.phone,
            idType: flow.data.idType as 'NATIONAL_ID',
            idNumber: String(flow.data.idNumber),
            documents: {
              idFront: String(flow.data.idFront),
              ...(flow.data.idBack ? { idBack: String(flow.data.idBack) } : {}),
              selfie: image,
            },
          });
          session.flow = undefined;
          // Never claim "verified" here - verification is a review decision. We
          // notify the user with the outcome separately (WhatsAppNotify.kycStatus).
          await reply(
            session,
            '✅ Thank you. Your documents are submitted and *under review*.\nA BiZik reviewer checks them by hand, and I\'ll message you here as soon as it\'s approved (or if we need anything more).\n\nMeanwhile you can check your wallet, *receive* money at your handle, and view or *pay* a deal. Those don\'t need verification.',
          );
          await sendMenu(session);
        } catch (error) {
          session.flow = undefined;
          await reply(session, `Verification could not be submitted: ${(error as Error).message}`);
        }
        await WaSessionStore.save(session);
        return;
      }
      default:
        session.flow = undefined;
        await reply(session, 'Let\'s start over. Type VERIFY to verify your account.');
        await WaSessionStore.save(session);
    }
  },

  // ---- PIN setup / entry ----
  async handlePinSetup(session: WaSession, text: string): Promise<void> {
    if (!WhatsAppSecurity.isValidPinFormat(text)) {
      await reply(session, 'Your PIN must be 4 to 6 digits. Reply with the digits (e.g. 1234).');
      return;
    }
    await WhatsAppSecurity.setPin(session.userId as string, text);
    session.awaitingPinSetup = false;
    session.lastStepUpAt = Date.now();
    await reply(session, '✅ PIN set. Keep it secret.');
    if (session.pending) await this.confirmPending(session);
    await WaSessionStore.save(session);
  },

  /**
   * A PIN entry. Anything that is not PIN-shaped (4-6 digits) is someone talking
   * to us - "I forgot my PIN", a question - and must NOT burn one of their five
   * attempts, which is how a forgotten PIN used to lock an account out.
   */
  async handlePinEntry(session: WaSession, text: string): Promise<void> {
    if (!WhatsAppSecurity.isValidPinFormat(text)) {
      const forgotten = /forgot|forgotten|remember|lost|reset|oublie|perdu/i.test(text);
      await reply(
        session,
        forgotten
          ? "No problem. I can't recover a PIN, but you can clear it yourself: open the BiZik app → *Settings → Security → WhatsApp → Reset WhatsApp PIN*. Then come back and you'll set a new one on your next payment.\n\nReply *CANCEL* to drop this payment for now."
          : 'That doesn\'t look like your PIN. Reply with your *4-6 digit PIN* to approve, or type *CANCEL* to stop.',
      );
      await WaSessionStore.save(session);
      return;
    }
    const outcome = await WhatsAppSecurity.verifyPin(session.userId as string, text);
    if (outcome.result === 'ok') {
      session.awaitingPin = false;
      session.lastStepUpAt = Date.now();
      await this.executePending(session);
      return;
    }
    if (outcome.result === 'locked') {
      session.awaitingPin = false;
      session.pending = undefined;
      await reply(session, '🔒 Too many wrong PINs. WhatsApp money actions are locked. Reset your PIN in the BiZik app.');
      await WaSessionStore.save(session);
      return;
    }
    await reply(session, `Wrong PIN. ${outcome.left ?? 0} attempt(s) left. Reply with your PIN, or type CANCEL.`);
  },

  /** User tapped Confirm - decide whether a PIN step-up is needed, then run. */
  async confirmPending(session: WaSession): Promise<void> {
    const pending = session.pending;
    if (!pending) return;
    if (pending.requiresPin && config.whatsapp.requirePin && !WaSessionStore.stepUpValid(session)) {
      if (!(await WhatsAppSecurity.hasPin(session.userId as string))) {
        session.awaitingPinSetup = true;
        await reply(session, '🔐 Create a 4 to 6 digit BiZik PIN to approve this (reply with the digits).');
      } else {
        session.awaitingPin = true;
        await reply(session, '🔐 Enter your BiZik PIN to approve.');
      }
      await WaSessionStore.save(session);
      return;
    }
    await this.executePending(session);
  },

  async executePending(session: WaSession): Promise<void> {
    const pending = session.pending;
    if (!pending) return;
    session.pending = undefined;
    try {
      const result = await WhatsAppTools.executeConfirmed(pending, this.ctx(session));
      session.history.push({ role: 'assistant', content: result });
      await reply(session, result);
    } catch (error) {
      const msg = (error as Error).message;
      // Remember it, so the assistant can't turn round and offer the very same
      // thing again while the user is still reacting to the failure.
      session.lastFailedAction = {
        tool: pending.tool,
        argsKey: actionKey({ tool: pending.tool, args: pending.args }),
        looseKey: looseActionKey({ tool: pending.tool, args: pending.args }),
        at: Date.now(),
        message: msg,
      };
      if (/kyc|verify your account/i.test(msg)) {
        await reply(session, `${msg}\n\nReply *VERIFY* to complete your verification now, then try again.`);
      } else {
        await reply(session, `Could not complete that: ${msg}`);
      }
    }
    await WaSessionStore.save(session);
  },
};
