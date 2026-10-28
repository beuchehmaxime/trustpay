import type Anthropic from '@anthropic-ai/sdk';

import { ContractService } from '../contract/contract.service';
import { decryptField } from '../lib/crypto';
import { homeCurrencyFor } from '../lib/domain';
import { isVerifiedTier } from '../lib/kyc-gate';
import { isSameNumber, isValidPhone, numberTail, textContainsNumber, toMsisdn } from '../lib/phone';
import { PaymentService } from '../payments/application/payment.service';
import { NudgeService } from '../reminder/nudge.service';
import { TransferService } from '../transfer/transfer.service';
import { EscrowService } from '../escrow/escrow.service';
import { WalletService } from '../wallet/wallet.service';
import { resolveParties } from '../lib/contract-flow';
import { prisma } from '../lib/prisma';
import type { PendingAction } from './whatsapp-session';

/**
 * The ONLY way the AI can touch BiZik. Read tools run immediately and return
 * live data (the model never invents balances). Money tools do NOT execute -
 * they validate and return a `propose` result that the service layer turns into
 * a confirmation the user must approve (and PIN) before `executeConfirmed` runs
 * the real, existing, audited service. AI proposes; the backend disposes.
 */

export interface ToolContext {
  userId: string;
  locale: 'en' | 'fr';
}

export type ToolResult =
  | { kind: 'data'; content: string }
  | { kind: 'propose'; pending: PendingAction }
  | { kind: 'error'; message: string };

const CURRENCIES = ['XAF', 'USD', 'EUR', 'GBP', 'NGN', 'GHS'];

/** Tools whose call executes immediately (safe, read-only). */
export const READ_TOOLS = new Set([
  'get_balance',
  'get_my_handle',
  'list_my_deals',
  'get_deal',
  'get_help',
  'remind_counterparty',
]);

// ---- Minimal shapes of the service returns we read (cast, not redefine) -----
interface Wallet { currency: string; balance: number }
interface Overview { wallets: Wallet[] }
interface DealRow { id: string; title: string; status?: string; statusLabel?: string; amount?: number; currency?: string; counterpartyName?: string; canCancel?: boolean; viewerRole?: 'client' | 'freelancer' }
interface DealList { mine: DealRow[]; invited: DealRow[] }
interface Milestone { id: string; title: string; amount: number; currency?: string; status: string; rawStatus?: string; canCancel?: boolean }
interface DealDetail {
  id: string;
  title: string;
  status?: string;
  statusLabel?: string;
  currency?: string;
  milestones: Milestone[];
  counterpartyName?: string;
  counterparty?: string;
  amount?: number;
  isCreator?: boolean;
  canCancel?: boolean;
  /** 'client' = this user is the PAYER/buyer (funds escrow); 'freelancer' = payee/seller. */
  viewerRole?: 'client' | 'freelancer';
  accepted?: boolean;
}
interface PayoutMethod {
  id: string;
  /** 'momo' | 'bank' | 'payoneer' - only mobile money can be charged for a top-up. */
  kind?: string;
  name?: string;
  detail?: string;
  verified?: boolean;
  isDefault?: boolean;
}

/**
 * A Mobile Money number may only be charged if the USER actually put it forward:
 * their own account number, one of their saved payout methods, or a number they
 * typed into this chat. The model is told never to invent one, but a model
 * following instructions is not a control - this is, and it runs again at
 * execution time, so an invented or altered number can never be charged.
 */
async function numberCameFromUser(userId: string, msisdn: string): Promise<boolean> {
  // Compared on the subscriber tail, so local and international spellings of
  // the SAME number match while a near-miss (one digit off) does not.
  if (numberTail(msisdn).length < 8) return false;

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { phone: true } });
  if (user?.phone && isSameNumber(user.phone, msisdn)) return true;

  const methods = await prisma.payoutMethod.findMany({
    where: { userId, deletedAt: null },
    select: { accountDetail: true },
  });
  for (const method of methods) {
    try {
      if (isSameNumber(decryptField(method.accountDetail), msisdn)) return true;
    } catch {
      // A method we can't read is simply not a match.
    }
  }

  // Anything they typed (or dictated) in the last hour counts as theirs to use.
  const recent = await prisma.whatsAppMessage.findMany({
    where: {
      userId,
      direction: 'INBOUND',
      createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) },
    },
    select: { body: true },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });
  return recent.some((message) => textContainsNumber(message.body ?? '', msisdn));
}

const UNKNOWN_NUMBER_MESSAGE =
  'That Mobile Money number did not come from the user, so it cannot be charged. NEVER invent, guess or complete a number. Ask them to type the exact number to charge, then call fund_milestone again with what they send.';

function money(amount: number, currency = 'XAF'): string {
  const symbol = currency === 'XAF' ? 'FCFA' : currency;
  return `${symbol} ${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

/**
 * Decide whether the deal creator is the payer (buyer). Prefer the explicit
 * `my_role` enum ('buyer'|'seller'); fall back to a resolved `creator_is_payer`
 * flag or the legacy `i_pay` boolean. Seller = payee (receives), buyer = payer.
 */
function resolveCreatorIsPayer(input: Record<string, unknown>): boolean {
  if (typeof input.creator_is_payer === 'boolean') return input.creator_is_payer;
  const role = typeof input.my_role === 'string' ? input.my_role.toLowerCase() : '';
  if (role === 'seller') return false;
  if (role === 'buyer') return true;
  return Boolean(input.i_pay);
}

// ---------------------------------------------------------------------------
// Tool definitions handed to Claude
// ---------------------------------------------------------------------------
export const TOOL_DEFINITIONS: Anthropic.Tool[] = [
  {
    name: 'get_balance',
    description: "Get the current user's wallet balances across all currencies. Use when they ask about balance/money in their wallet.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_my_deals',
    description: 'List the deals the user created and the ones they were invited to, with status. Use for "my deals", "my transactions", "status".',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_deal',
    description: 'Get one deal in detail, including its milestones and their ids/status (needed before funding or releasing).',
    input_schema: {
      type: 'object',
      properties: { deal_id: { type: 'string', description: 'The deal reference, e.g. QTQ-...' } },
      required: ['deal_id'],
    },
  },
  {
    name: 'get_help',
    description: 'Explain how BiZik escrow works, fees, safety, disputes, supported currencies/payments. Use for general questions.',
    input_schema: {
      type: 'object',
      properties: { topic: { type: 'string', description: 'What the user is asking about' } },
    },
  },
  {
    name: 'create_deal',
    description: 'Propose creating a new secure escrow deal. Does NOT execute until the user confirms. Collect all fields first.',
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short title of the item/service' },
        description: { type: 'string' },
        amount: { type: 'number', description: 'Total amount' },
        currency: { type: 'string', enum: CURRENCIES },
        counterparty_name: {
          type: 'string',
          description:
            "OPTIONAL. The name the user knows the other party by (their own reference/alias for this deal, NOT necessarily the other party's real name). If the user only gives a phone number and no name, OMIT this; the other party's real account name is used once they join. Never invent a name.",
        },
        counterparty_phone: { type: 'string', description: 'The other party\'s phone in international format e.g. +2376...' },
        my_role: {
          type: 'string',
          enum: ['buyer', 'seller'],
          description:
            "THIS user's role in this deal. 'buyer' = they PAY money into escrow to receive goods/work. 'seller' = they DELIVER the goods/work and RECEIVE the payment. Set this from what the user actually says (e.g. \"I am the seller\", \"I'm selling\", \"I'll deliver\" → seller; \"I'm buying\", \"I'll pay\" → buyer). Do NOT assume the creator is the buyer. If the user has not said which side they are on, ASK before proposing.",
        },
        delivery_date: { type: 'string', description: 'Expected delivery date YYYY-MM-DD (must be today or later, never in the past)' },
      },
      required: ['title', 'amount', 'currency', 'counterparty_phone', 'my_role', 'delivery_date'],
    },
  },
  {
    name: 'remind_counterparty',
    description:
      "Send the OTHER party a reminder about whatever a deal is waiting on: to accept it, fund it, deliver it, or approve a delivery. Works for either side (a seller can chase a buyer to fund or approve; a buyer can chase a seller to deliver). BiZik writes the message from the deal's real state, so the user cannot dictate its wording. Runs immediately; no confirmation needed. Use whenever the user asks to remind, nudge, chase or follow up with the other person.",
    input_schema: {
      type: 'object',
      properties: { deal_id: { type: 'string', description: 'The deal reference, e.g. QTQ-...' } },
      required: ['deal_id'],
    },
  },
  {
    name: 'cancel_deal',
    description:
      "Propose cancelling a deal the user CREATED. Only the creator can cancel their own deal, and only while no milestone has been funded. Does NOT execute until the user confirms. Use list_my_deals or get_deal first if you are unsure which deal they mean.",
    input_schema: {
      type: 'object',
      properties: { deal_id: { type: 'string', description: 'The deal reference, e.g. QTQ-...' } },
      required: ['deal_id'],
    },
  },
  {
    name: 'cancel_milestone',
    description:
      'Propose cancelling ONE unfunded milestone of a deal the user created (the rest of the deal stays). A funded milestone cannot be cancelled. Get the milestone id via get_deal first. Does NOT execute until the user confirms.',
    input_schema: {
      type: 'object',
      properties: { milestone_id: { type: 'string' } },
      required: ['milestone_id'],
    },
  },
  {
    name: 'fund_milestone',
    description:
      "Propose funding a milestone (or a simple one-payment deal) into escrow. The payer can pay straight from a Mobile Money number (pass momo_number and they get a payment prompt on that phone), or from their BiZik wallet balance when momo_number is omitted. If their wallet cannot cover it, ASK for the Mobile Money number to charge instead of failing. Does NOT execute until confirmed + PIN. Get the milestone id via get_deal first.",
    input_schema: {
      type: 'object',
      properties: {
        milestone_id: { type: 'string' },
        momo_number: {
          type: 'string',
          description:
            "The Mobile Money number to charge, in local or international format (e.g. 677123456 or +237677123456). Omit to pay from the user's BiZik wallet balance. Only ever the number the USER gives you. Never invent one, and never use the other party's number.",
        },
      },
      required: ['milestone_id'],
    },
  },
  {
    name: 'release_milestone',
    description: 'Propose releasing a funded milestone to the payee (the money leaves escrow). Does NOT execute until confirmed + PIN. Get the milestone id via get_deal first.',
    input_schema: {
      type: 'object',
      properties: { milestone_id: { type: 'string' } },
      required: ['milestone_id'],
    },
  },
  {
    name: 'send_money',
    description:
      "Propose sending money from the user's BiZik wallet to another BiZik user, addressed by their handle (e.g. @maxime.b) or their phone number. This is a DIRECT payment with no escrow protection. Use it when the user says send/transfer/pay someone. For anything where goods or work are exchanged, propose a deal (create_deal) instead so the money is protected. Does NOT execute until confirmed + PIN.",
    input_schema: {
      type: 'object',
      properties: {
        to: {
          type: 'string',
          description:
            "The recipient's BiZik handle (with or without @) or phone number, exactly as the user gave it. Never invent one.",
        },
        amount: { type: 'number' },
        currency: { type: 'string', enum: CURRENCIES },
        note: { type: 'string', description: "Optional short message from the sender, e.g. 'for the shoes'" },
      },
      required: ['to', 'amount', 'currency'],
    },
  },
  {
    name: 'get_my_handle',
    description:
      "Get the user's own BiZik handle: what they share so other people can send THEM money. Use for \"what's my username/handle\", \"how do people pay me\", \"receive money\".",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'deposit_to_wallet',
    description:
      "Propose adding money to the user's OWN BiZik wallet from Mobile Money. They approve a prompt on their phone; the wallet is credited once the payment confirms. Pass momo_number only if the user gives one, otherwise their saved payment method is used automatically. Use for 'deposit', 'add money', 'top up', 'fund my wallet', 'recharger'. Does NOT execute until confirmed + PIN.",
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number', description: 'How much to add' },
        currency: { type: 'string', enum: CURRENCIES, description: "Omit to use the user's own currency" },
        momo_number: {
          type: 'string',
          description:
            'The Mobile Money number to charge, ONLY if the user names one. Omit to use their saved payment method. Never invent a number.',
        },
      },
      required: ['amount'],
    },
  },
  {
    name: 'withdraw',
    description: 'Propose withdrawing money from the wallet to a saved payout method. Does NOT execute until confirmed + PIN.',
    input_schema: {
      type: 'object',
      properties: {
        amount: { type: 'number' },
        currency: { type: 'string', enum: CURRENCIES },
      },
      required: ['amount', 'currency'],
    },
  },
];

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------
export const WhatsAppTools = {
  /** Run a read tool now, or validate a money tool and return a proposal. */
  async run(name: string, input: Record<string, unknown>, ctx: ToolContext): Promise<ToolResult> {
    try {
      switch (name) {
        case 'get_balance': {
          const [overview, me] = await Promise.all([
            WalletService.overview(ctx.userId) as unknown as Promise<Overview>,
            TransferService.myHandle(ctx.userId),
          ]);
          const lines = overview.wallets
            .filter((wallet) => wallet.balance > 0)
            .map((wallet) => `• ${money(wallet.balance, wallet.currency)}`);
          const balance = lines.length
            ? `Wallet balance:\n${lines.join('\n')}`
            : 'Your wallet is empty (all balances are 0).';
          return {
            kind: 'data',
            content: `${balance}\nTheir own handle for receiving money: @${me.username}`,
          };
        }
        case 'list_my_deals': {
          const list = (await ContractService.list(ctx.userId)) as unknown as DealList;
          const fmt = (deal: DealRow) => {
            const role = deal.viewerRole === 'client' ? 'you pay' : deal.viewerRole === 'freelancer' ? 'you get paid' : '';
            return `• ${deal.title}, ${money(deal.amount ?? 0, deal.currency)}, ${deal.statusLabel ?? deal.status ?? ''}${
              role ? `, ${role}` : ''
            }${deal.canCancel ? ', cancellable' : ''} (${deal.id})`;
          };
          const mine = list.mine.map(fmt).join('\n') || 'none';
          const invited = list.invited.map(fmt).join('\n') || 'none';
          // Spell out the two buckets: "my deals" means the ones this user
          // created, "deals I'm part of / invited to" means the other list.
          const hint =
            list.mine.length === 0 && list.invited.length > 0
              ? `\n\nThis user has created no deals of their own, but IS part of ${list.invited.length} deal(s) they were invited to (listed above) - offer those.`
              : list.invited.length === 0 && list.mine.length > 0
                ? `\n\nThis user has not been invited to any deals, but has ${list.mine.length} of their own (listed above) - offer those.`
                : '';
          return {
            kind: 'data',
            content: `Deals THIS USER CREATED (their "my deals"):\n${mine}\n\nDeals THIS USER WAS INVITED TO by someone else (the deals they are "part of"):\n${invited}${hint}`,
          };
        }
        case 'get_deal': {
          const deal = (await ContractService.byId(ctx.userId, String(input.deal_id))) as unknown as DealDetail;
          const ms = deal.milestones
            .map(
              (m) =>
                `  - ${m.title}: ${money(m.amount, m.currency ?? deal.currency)} [${m.status}]${
                  m.canCancel ? ' (cancellable)' : ''
                } id=${m.id}`,
            )
            .join('\n');
          const cancelLine = deal.isCreator
            ? `\nCan the user cancel this whole deal? ${deal.canCancel ? 'yes' : 'no - it is already funded or closed'}`
            : '\nThe user did not create this deal, so they cannot cancel it.';
          // Role line drives WHO may fund: only the payer (buyer) funds escrow.
          const roleLine =
            deal.viewerRole === 'client'
              ? '\nThis user is the BUYER (payer): they fund the escrow.'
              : deal.viewerRole === 'freelancer'
                ? '\nThis user is the SELLER (payee): they do NOT fund: they deliver and get paid. Do not offer to fund this deal.'
                : '';
          return {
            kind: 'data',
            content: `Deal ${deal.title} (${deal.id})\nStatus: ${deal.statusLabel ?? deal.status ?? ''}\nCounterparty: ${deal.counterpartyName ?? 'not set'}${roleLine}${cancelLine}\nMilestones:\n${ms}`,
          };
        }
        case 'get_my_handle': {
          const me = await TransferService.myHandle(ctx.userId);
          return {
            kind: 'data',
            content: `The user's BiZik handle is @${me.username} (account name: ${me.fullName}). Anyone can send them money by typing that handle. Share it exactly, including the @.`,
          };
        }
        case 'get_help': {
          return {
            kind: 'data',
            content:
              'BiZik holds a buyer\'s money safely in escrow until the goods/work are delivered and approved; then the seller is paid. Pay in and out with MTN/Orange Mobile Money, bank or wallet. Fees are shown before you confirm. If there\'s a problem, open a dispute and a neutral BiZik mediator decides. Currencies: FCFA (XAF), USD, EUR, GBP, NGN, GHS.',
          };
        }

        case 'remind_counterparty': {
          const outcome = await NudgeService.remind(ctx.userId, String(input.deal_id));
          if (outcome.nothingPending) {
            return {
              kind: 'data',
              content:
                'This deal is not waiting on the other party right now, so there is nothing to remind them about.',
            };
          }
          if (outcome.yourMove) {
            return {
              kind: 'data',
              content: `Nothing to remind them about: this deal is waiting on THIS user, not the other party. What is outstanding: ${outcome.action}. Tell them that plainly and offer to help them do it.`,
            };
          }
          if (outcome.tooSoon) {
            return {
              kind: 'data',
              content: `A reminder for this deal was already sent recently. The next one can go out in about ${outcome.waitMinutes} minutes. Tell the user their reminder is already with the other party.`,
            };
          }
          const via = (outcome.channels ?? []).join(', ') || 'the BiZik app';
          return {
            kind: 'data',
            content: `Reminder sent to ${outcome.recipientName ?? 'the other party'} via: ${via}. It asks them to: ${outcome.action}. Tell the user it is done and, briefly, how the person was reached.`,
          };
        }

        // ---- Money tools: validate + propose (never execute here) ----
        case 'create_deal': {
          const amount = Number(input.amount);
          if (!(amount > 0)) return { kind: 'error', message: 'Amount must be greater than 0.' };
          const currency = String(input.currency).toUpperCase();
          if (!CURRENCIES.includes(currency)) return { kind: 'error', message: 'Unsupported currency.' };
          const deliveryDate = String(input.delivery_date ?? '');
          if (/^\d{4}-\d{2}-\d{2}$/.test(deliveryDate) && deliveryDate < new Date().toISOString().slice(0, 10)) {
            return { kind: 'error', message: 'The delivery date is in the past. Please give a date from today onward.' };
          }
          const creatorIsPayer = resolveCreatorIsPayer(input);
          const role = creatorIsPayer
            ? 'Your role: *BUYER*, you pay into escrow'
            : 'Your role: *SELLER*, you deliver and receive the payment';
          // The name is the creator's own reference (optional). If none, we show
          // the number and use the other party's real name once they join.
          const alias = typeof input.counterparty_name === 'string' ? input.counterparty_name.trim() : '';
          const withLine = alias
            ? `${alias} (${String(input.counterparty_phone)})`
            : `${String(input.counterparty_phone)} (name will come from their account)`;
          const summary =
            `📝 *New deal*\n\n• ${String(input.title)}\n• ${money(amount, currency)}\n• With: ${withLine}\n• ${role}\n• Delivery by: ${deliveryDate}\n\nCreate this deal?`;
          // Persist the resolved role so execution can't re-interpret it.
          return {
            kind: 'propose',
            pending: { tool: name, args: { ...input, creator_is_payer: creatorIsPayer }, summary, requiresPin: false },
          };
        }
        case 'cancel_deal': {
          const deal = (await ContractService.byId(ctx.userId, String(input.deal_id))) as unknown as DealDetail;
          if (!deal.isCreator) {
            return {
              kind: 'error',
              message: `Only the person who created "${deal.title}" can cancel it. The other party can decline it while it is still waiting on them, or open a dispute once it is funded.`,
            };
          }
          if (!deal.canCancel) {
            return {
              kind: 'error',
              message: `"${deal.title}" can no longer be cancelled - it is already funded or closed. Refund the funded milestone or open a dispute instead.`,
            };
          }
          const withWhom = deal.counterparty ? ` with ${deal.counterparty}` : '';
          const summary =
            `Cancel the deal *${deal.title}* (${money(deal.amount ?? 0, deal.currency)})${withWhom}.\n\nThis cannot be undone - a cancelled deal cannot be revived or re-invited.\n\nCancel it?`;
          // Destructive and irreversible: number control alone is not enough.
          return { kind: 'propose', pending: { tool: name, args: input, summary, requiresPin: true } };
        }
        case 'cancel_milestone': {
          const summary =
            'Cancel this milestone. The rest of the deal stays as it is and the deal total drops by this amount. This cannot be undone.\n\nCancel the milestone?';
          return { kind: 'propose', pending: { tool: name, args: input, summary, requiresPin: true } };
        }
        case 'fund_milestone': {
          // Only the BUYER (paying party) funds escrow. Never offer/propose
          // funding to the seller - surface a clear message instead.
          const milestone = await prisma.milestone.findUnique({
            where: { id: String(input.milestone_id) },
            include: { contract: true },
          });
          if (!milestone) {
            return { kind: 'error', message: 'I couldn\'t find that milestone. Say "my deals" and I\'ll show you the right one.' };
          }
          const { payerId } = resolveParties(milestone.contract);
          if (payerId && ctx.userId !== payerId) {
            return {
              kind: 'error',
              message:
                '🚫 You\'re the *seller* on this deal, so you don\'t fund it. The *buyer* pays into escrow. You\'ll be paid once you deliver and it\'s approved.',
            };
          }
          // One quote, computed by escrow itself - the number we show is the
          // number that gets charged.
          const quote = await EscrowService.fundingQuote(ctx.userId, String(input.milestone_id));
          const rawNumber = typeof input.momo_number === 'string' ? input.momo_number.trim() : '';
          // People type their number locally ("677123456") - make it dialable
          // using the payer's own country before anything is charged.
          const payer = rawNumber
            ? await prisma.user.findUnique({ where: { id: ctx.userId }, select: { country: true } })
            : null;
          const momoNumber = rawNumber ? toMsisdn(rawNumber, payer?.country) : '';
          if (rawNumber && !isValidPhone(momoNumber)) {
            return {
              kind: 'error',
              message: `"${rawNumber}" does not look like a Mobile Money number. Ask them to send it again: local (677123456) or international (+237677123456) both work.`,
            };
          }
          if (momoNumber && !(await numberCameFromUser(ctx.userId, momoNumber))) {
            return { kind: 'error', message: UNKNOWN_NUMBER_MESSAGE };
          }

          if (!momoNumber && !quote.walletCovers) {
            return {
              kind: 'error',
              message: `Their wallet holds ${money(quote.walletBalance, quote.currency)} but funding "${quote.milestoneTitle}" needs ${money(quote.total, quote.currency)} (including the ${money(quote.fee, quote.currency)} fee). ASK them which Mobile Money number to charge, then call fund_milestone again with momo_number.`,
            };
          }

          const lines = [
            `💰 *Fund ${quote.dealTitle}*${quote.milestoneTitle !== quote.dealTitle ? `: ${quote.milestoneTitle}` : ''}`,
            '',
            `• Amount: ${money(quote.amount, quote.currency)}`,
            `• Fee: ${money(quote.fee, quote.currency)}`,
            `• Total: ${money(quote.total, quote.currency)}`,
            momoNumber
              ? `• Pay from: Mobile Money ${momoNumber} (you'll approve a prompt on that phone)`
              : `• Pay from: your BiZik wallet`,
            '',
            'The money is held safely in escrow until you approve the delivery.',
          ];
          return {
            kind: 'propose',
            pending: {
              tool: name,
              args: { milestone_id: String(input.milestone_id), momo_number: momoNumber || undefined },
              summary: lines.join('\n'),
              requiresPin: true,
            },
          };
        }
        case 'release_milestone': {
          // Releasing is the payer's call - the same side that funded it. Don't
          // walk a seller through a confirmation the server will reject.
          const milestone = await prisma.milestone.findUnique({
            where: { id: String(input.milestone_id) },
            include: { contract: true },
          });
          if (!milestone) {
            return { kind: 'error', message: 'I couldn\'t find that milestone. Say "my deals" and I\'ll show you the right one.' };
          }
          const { payerId: releaser } = resolveParties(milestone.contract);
          if (releaser && ctx.userId !== releaser) {
            return {
              kind: 'error',
              message:
                '🚫 You\'re the *seller* on this deal, so you can\'t release the money to yourself. The *buyer* releases it once they\'ve approved your delivery, or it auto-releases after the inspection window.',
            };
          }
          const summary = `✅ Release this milestone. The money leaves escrow and is paid to the seller. This cannot be undone.\n\nConfirm release?`;
          return { kind: 'propose', pending: { tool: name, args: input, summary, requiresPin: true } };
        }
        case 'send_money': {
          const amount = Number(input.amount);
          if (!(amount > 0)) return { kind: 'error', message: 'Amount must be greater than 0.' };
          const currency = String(input.currency).toUpperCase();
          if (!CURRENCIES.includes(currency)) return { kind: 'error', message: 'Unsupported currency.' };

          const target = String(input.to ?? '').trim();
          const recipient = await TransferService.resolveRecipient(target);
          if (!recipient) {
            return {
              kind: 'error',
              message: `No BiZik account matches "${target}". Ask the user to check the handle (like @maxime.b) or the phone number. Do not guess a different one.`,
            };
          }
          if (recipient.id === ctx.userId) {
            return { kind: 'error', message: 'That is the user\'s own account. They cannot send money to themselves.' };
          }

          // Naming the actual human being paid is the whole safety of this
          // flow: a handle typo must be caught HERE, not after the money moves.
          const handle = recipient.username ? `@${recipient.username}` : target;
          const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : '';
          const summary =
            `💸 *Send ${money(amount, currency)}*\n\n• To: *${recipient.fullName}* (${handle})` +
            (note ? `\n• Note: ${note}` : '') +
            `\n\n⚠️ This is a direct transfer. The money is NOT held in escrow and cannot be reversed. Make sure this is the right person.\n\nSend it?`;
          return {
            kind: 'propose',
            pending: {
              tool: name,
              args: { to: target, amount, currency, note: note || undefined },
              summary,
              requiresPin: true,
            },
          };
        }
        case 'deposit_to_wallet': {
          const amount = Number(input.amount);
          if (!(amount > 0)) return { kind: 'error', message: 'Amount must be greater than 0.' };

          const owner = await prisma.user.findUnique({
            where: { id: ctx.userId },
            select: { country: true },
          });
          const currency = input.currency
            ? String(input.currency).toUpperCase()
            : homeCurrencyFor(owner?.country);
          if (!CURRENCIES.includes(currency)) return { kind: 'error', message: 'Unsupported currency.' };

          // Either a number they just gave us, or a payment method they already
          // proved they own. Never a number we invented or inferred.
          const typed = typeof input.momo_number === 'string' ? input.momo_number.trim() : '';
          let payoutMethodId: string | undefined;
          let sourceLabel: string;

          if (typed) {
            const msisdn = toMsisdn(typed, owner?.country);
            if (!isValidPhone(msisdn)) {
              return {
                kind: 'error',
                message: `"${typed}" does not look like a Mobile Money number. Ask them to send it again: local (677123456) or international (+237677123456) both work.`,
              };
            }
            if (!(await numberCameFromUser(ctx.userId, msisdn))) {
              return { kind: 'error', message: UNKNOWN_NUMBER_MESSAGE };
            }
            sourceLabel = `Mobile Money ${msisdn}`;
            const summary =
              `💰 *Add ${money(amount, currency)}* to your BiZik wallet` +
              `\n\n• From: ${sourceLabel}` +
              `\n\nYou'll approve a prompt on that phone. Your Mobile Money PIN is entered there, never here.`;
            return {
              kind: 'propose',
              pending: {
                tool: name,
                args: { amount, currency, momo_number: msisdn },
                summary,
                requiresPin: true,
              },
            };
          }

          const methods = (await WalletService.listPayoutMethods(ctx.userId)) as unknown as PayoutMethod[];
          const momo = methods.filter((entry) => entry.kind === 'momo');
          const chosen = momo.find((entry) => entry.isDefault) ?? momo[0];
          if (!chosen) {
            return {
              kind: 'error',
              message:
                'They have no saved Mobile Money method. Ask which Mobile Money number to charge, then call deposit_to_wallet again with momo_number.',
            };
          }
          payoutMethodId = chosen.id;
          sourceLabel = `${chosen.name ?? 'Mobile Money'} ${chosen.detail ?? ''}`.trim();

          const summary =
            `💰 *Add ${money(amount, currency)}* to your BiZik wallet` +
            `\n\n• From: ${sourceLabel}` +
            `\n\nYou'll approve a prompt on that phone. Your Mobile Money PIN is entered there, never here.`;
          return {
            kind: 'propose',
            pending: { tool: name, args: { amount, currency, payoutMethodId }, summary, requiresPin: true },
          };
        }
        case 'withdraw': {
          const amount = Number(input.amount);
          if (!(amount > 0)) return { kind: 'error', message: 'Amount must be greater than 0.' };
          // Say this up front rather than after they have chosen a method.
          const withdrawer = await prisma.user.findUnique({
            where: { id: ctx.userId },
            select: { kycTier: true },
          });
          if (!withdrawer || !isVerifiedTier(withdrawer.kycTier)) {
            return {
              kind: 'error',
              message:
                'Withdrawing needs a verified account. Tell them their money is safe in their wallet, and offer to start verification now (they can still receive money meanwhile).',
            };
          }
          const methods = (await WalletService.listPayoutMethods(ctx.userId)) as unknown as PayoutMethod[];
          const method = methods.find((candidate) => candidate.isDefault) ?? methods[0];
          if (!method) {
            return { kind: 'error', message: 'You have no saved payout method. Please add one in the BiZik app first.' };
          }
          const currency = String(input.currency).toUpperCase();
          const summary = `🏧 *Withdraw ${money(amount, currency)}* to ${method.name ?? 'your payout method'} ${method.detail ?? ''}.\n\nConfirm withdrawal?`;
          return {
            kind: 'propose',
            pending: { tool: name, args: { amount, currency, payoutMethodId: method.id }, summary, requiresPin: true },
          };
        }
        default:
          return { kind: 'error', message: `Unknown action: ${name}` };
      }
    } catch (error) {
      return { kind: 'error', message: (error as Error).message || 'Something went wrong.' };
    }
  },

  /**
   * Execute a money action AFTER the user has confirmed (and PINned). Calls the
   * real, audited services - same code paths as the app. Ownership/limits/fees
   * are enforced inside those services, not here.
   */
  async executeConfirmed(pending: PendingAction, ctx: ToolContext): Promise<string> {
    const args = pending.args;
    switch (pending.tool) {
      case 'create_deal': {
        await ContractService.create(ctx.userId, {
          title: String(args.title),
          description: args.description ? String(args.description) : undefined,
          currency: String(args.currency).toUpperCase() as 'XAF',
          counterpartyName:
            typeof args.counterparty_name === 'string' && args.counterparty_name.trim()
              ? args.counterparty_name.trim()
              : undefined,
          counterpartyPhone: String(args.counterparty_phone),
          creatorIsPayer: resolveCreatorIsPayer(args),
          milestones: [
            { title: String(args.title), amount: Number(args.amount), dueDate: String(args.delivery_date) },
          ],
        });
        return "✅ Deal created. We're inviting the other party on WhatsApp (and SMS) to accept it. You'll be notified when they respond. You can say *resend invite* if they need a reminder.";
      }
      case 'cancel_deal': {
        await ContractService.cancel(ctx.userId, String(args.deal_id));
        return 'Deal cancelled. The other party has been notified - it can no longer be funded or revived.';
      }
      case 'cancel_milestone': {
        await ContractService.cancelMilestone(ctx.userId, String(args.milestone_id));
        return 'Milestone cancelled. The rest of the deal is unchanged.';
      }
      case 'fund_milestone': {
        const momoNumber = typeof args.momo_number === 'string' ? args.momo_number : '';
        if (!momoNumber) {
          await EscrowService.fundMilestone(ctx.userId, String(args.milestone_id), {});
          return '✅ Funded. The money is now held safely in escrow until delivery is approved.';
        }
        // Re-check provenance at execution time: the proposal may have been
        // built minutes ago, and this is the moment money would actually move.
        if (!(await numberCameFromUser(ctx.userId, momoNumber))) {
          throw new Error(
            'That number was not one you gave me, so I have not charged it. Please send me the exact Mobile Money number to use.',
          );
        }
        // Charge the number directly. The deposit carries what it is FOR, so the
        // milestone is funded automatically the moment the payment confirms -
        // escrow is never held against money that hasn't arrived.
        const quote = await EscrowService.fundingQuote(ctx.userId, String(args.milestone_id));
        await PaymentService.createDeposit({
          userId: ctx.userId,
          amount: quote.total,
          currency: quote.currency as 'XAF',
          provider: /^\+?237(6[5-9])/.test(momoNumber) ? 'MTN_MOBILE_MONEY' : 'ORANGE_MONEY',
          phoneNumber: momoNumber,
          purpose: 'FUND_MILESTONE',
          purposeRefId: String(args.milestone_id),
        });
        return `📲 Payment request sent to *${momoNumber}* for ${money(quote.total, quote.currency)}.\n\nApprove it on that phone (enter your Mobile Money PIN there, never here). As soon as it goes through, I'll put the money into escrow and tell you.`;
      }
      case 'release_milestone': {
        await EscrowService.release(ctx.userId, String(args.milestone_id));
        return '✅ Released. The seller has been paid from escrow.';
      }
      case 'send_money': {
        const sent = await TransferService.send(ctx.userId, {
          to: String(args.to),
          amount: Number(args.amount),
          currency: String(args.currency).toUpperCase() as 'XAF',
          note: typeof args.note === 'string' ? args.note : undefined,
        });
        return `✅ Sent ${money(sent.amount, sent.currency)} to *${sent.recipient.fullName}* (${sent.recipient.label}).\n\nYour balance is now ${money(sent.balanceAfter, sent.currency)}.`;
      }
      case 'deposit_to_wallet': {
        const momoNumber = typeof args.momo_number === 'string' ? args.momo_number : '';
        // Re-check provenance at the moment money would actually be collected.
        if (momoNumber && !(await numberCameFromUser(ctx.userId, momoNumber))) {
          throw new Error(
            'That number was not one you gave me, so I have not charged it. Please send me the exact Mobile Money number to use.',
          );
        }
        const amount = Number(args.amount);
        const currency = String(args.currency).toUpperCase() as 'XAF';
        await PaymentService.createDeposit({
          userId: ctx.userId,
          amount,
          currency,
          payoutMethodId: momoNumber ? undefined : String(args.payoutMethodId),
          provider: momoNumber
            ? /^\\+?237(6[5-9])/.test(momoNumber)
              ? 'MTN_MOBILE_MONEY'
              : 'ORANGE_MONEY'
            : undefined,
          phoneNumber: momoNumber || undefined,
        });
        return `📲 Payment request sent for *${money(amount, currency)}*.\n\nApprove it on your phone (enter your Mobile Money PIN there, never here). I'll tell you as soon as the money lands in your wallet.`;
      }
      case 'withdraw': {
        await WalletService.requestPayout(ctx.userId, {
          amount: Number(args.amount),
          currency: String(args.currency).toUpperCase() as 'XAF',
          payoutMethodId: String(args.payoutMethodId),
        });
        return '✅ Withdrawal requested. Large withdrawals may be reviewed before they are sent.';
      }
      default:
        throw new Error('Unknown confirmed action');
    }
  },
};
