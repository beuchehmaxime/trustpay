import Anthropic from '@anthropic-ai/sdk';

import { ContractService } from '../contract/contract.service';
import { DisputeService } from '../dispute/dispute.service';
import { EscrowService } from '../escrow/escrow.service';
import { KycService } from '../kyc/kyc.service';
import { WalletService } from '../wallet/wallet.service';
import type { PendingAction } from '../whatsapp/whatsapp-session';
import { TOOL_DEFINITIONS, WhatsAppTools, type ToolContext, type ToolResult } from '../whatsapp/whatsapp-tools';

/**
 * The in-app assistant's tools: everything the WhatsApp channel already had,
 * plus disputes.
 *
 * Disputes were the one part of the escrow lifecycle the assistant could not
 * touch. It could create a deal, fund it and release it, but the moment the
 * thing went wrong - which is the moment a user most wants to just explain the
 * problem to someone - it had nothing to offer. These five tools close that.
 *
 * The existing tools are delegated to rather than copied. `WhatsAppTools.run`
 * stays the one implementation of sending money and funding milestones; this
 * module handles only what it adds, and passes everything else straight
 * through. Two implementations of "send money" is how they drift apart.
 *
 * Which of these propose rather than execute, and why:
 *
 *   - `open_dispute` freezes the escrow account and stops the auto-release
 *     clock. That is money held still on someone else's deal, so it needs an
 *     approval and a PIN.
 *   - `withdraw_dispute` un-freezes it and restarts that clock, which can lead
 *     to the money being released automatically. Same reasoning, same PIN.
 *   - `send_dispute_message` moves no money, but the model writes the words and
 *     they are filed under the user's name in a record a mediator will read and
 *     rule on. Nobody should discover what was said on their behalf afterwards,
 *     so it is shown before it is sent - approved, but without a PIN.
 *   - reading disputes executes immediately, like every other read.
 */

/** Reasons a dispute can be filed under. Mirrors the Prisma enum exactly. */
const DISPUTE_REASONS = [
  'NON_DELIVERY',
  'INCOMPLETE_WORK',
  'QUALITY_BELOW_SPEC',
  'SCOPE_CREEP',
  'COMMUNICATION_BREAKDOWN',
  'OTHER',
] as const;

/** Tool names this module owns. Everything else goes to the WhatsApp tools. */
const OWN_TOOLS = new Set([
  'list_my_disputes',
  'get_dispute',
  'open_dispute',
  'send_dispute_message',
  'withdraw_dispute',
  'list_transactions',
  'get_verification_status',
  'list_payout_methods',
  'accept_deal',
  'decline_deal',
  'submit_delivery',
  'request_revision',
]);

/** Reads, which run the moment the model asks for them. */
export const ASSISTANT_READ_TOOLS = new Set([
  'list_my_disputes',
  'get_dispute',
  'list_transactions',
  'get_verification_status',
  'list_payout_methods',
]);

function money(amount: number, currency = 'XAF'): string {
  const symbol = currency === 'XAF' ? 'FCFA' : currency;
  return `${symbol} ${Math.abs(amount).toLocaleString('en-US', { minimumFractionDigits: 0 })}`;
}

// ---- Shapes of the service returns we read (cast, not redefine) ------------
interface DisputeRow {
  id: string;
  statusLabel?: string;
  status: string;
  reasonLabel?: string;
  reason: string;
  contractTitle: string;
  milestoneTitle: string;
  amount: number;
  currency: string;
  viewerRole: string;
  filedByYou: boolean;
  createdAt: string;
}

interface DisputeMessageRow {
  body: string;
  senderName?: string;
  mine?: boolean;
  createdAt: string;
}

interface DisputeDetail extends DisputeRow {
  description?: string;
  messages?: DisputeMessageRow[];
  canWithdraw?: boolean;
}

interface MilestoneRow {
  id: string;
  title: string;
  amount: number;
  currency?: string;
  status: string;
  rawStatus?: string;
}

interface DealDetail {
  id: string;
  title: string;
  currency?: string;
  milestones: MilestoneRow[];
}

export const ASSISTANT_TOOL_DEFINITIONS: Anthropic.Tool[] = [
  ...TOOL_DEFINITIONS,
  {
    name: 'list_my_disputes',
    description:
      'List every dispute the user is a party to, open and closed, with the deal, the amount and who filed it. Use for "my disputes", "my complaints", "mes litiges", or when they ask what is happening with a problem they reported.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'get_dispute',
    description:
      'Get one dispute in full: what was claimed, the messages exchanged so far, and whether it can still be withdrawn. Call this before sending a message about a dispute or withdrawing one.',
    input_schema: {
      type: 'object',
      properties: { dispute_id: { type: 'string', description: 'The dispute id' } },
      required: ['dispute_id'],
    },
  },
  {
    name: 'open_dispute',
    description:
      "Propose opening a dispute on a milestone whose work has been SUBMITTED and is still in its review period. Freezes the escrow and stops the auto-release clock. Does NOT execute until the user approves it. Call get_deal first to find the milestone id. Only the buyer or the seller on that deal can file. If the milestone is not in review, say so rather than proposing - there is nothing to dispute before delivery or after release.",
    input_schema: {
      type: 'object',
      properties: {
        milestone_id: { type: 'string', description: 'The milestone id, from get_deal' },
        reason: {
          type: 'string',
          enum: [...DISPUTE_REASONS],
          description:
            'NON_DELIVERY: nothing arrived. INCOMPLETE_WORK: part of it arrived. QUALITY_BELOW_SPEC: it arrived but is wrong or damaged. SCOPE_CREEP: more was demanded than agreed. COMMUNICATION_BREAKDOWN: the other party went silent. OTHER: anything else.',
        },
        description: {
          type: 'string',
          description:
            "What actually happened, in the user's own words, 5 to 2000 characters. A mediator reads this, so keep their account of it rather than summarising it away.",
        },
      },
      required: ['milestone_id', 'reason', 'description'],
    },
  },
  {
    name: 'send_dispute_message',
    description:
      'Propose adding a message to an open dispute, which both parties and the mediator will read. Does NOT send until the user approves the exact wording.',
    input_schema: {
      type: 'object',
      properties: {
        dispute_id: { type: 'string', description: 'The dispute id' },
        body: { type: 'string', description: 'The message, 1 to 2000 characters' },
      },
      required: ['dispute_id', 'body'],
    },
  },
  {
    name: 'withdraw_dispute',
    description:
      'Propose withdrawing a dispute the user themselves filed. Un-freezes the escrow and restarts the auto-release clock, so the money can then be released to the seller automatically. Only the person who filed it can withdraw it. Does NOT execute until the user approves.',
    input_schema: {
      type: 'object',
      properties: { dispute_id: { type: 'string', description: 'The dispute id' } },
      required: ['dispute_id'],
    },
  },
  {
    name: 'list_transactions',
    description:
      'The money that has actually moved in and out of this wallet: deposits, withdrawals, transfers sent and received, escrow funding and releases, fees and conversions, each with its status. Use for "my transactions", "my history", "what did I spend", "did that payment go through", "mes transactions", "mon historique". This is NOT the deal list - a deal is an agreement, a transaction is money that moved.',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'How many of the most recent to return. Defaults to 10, maximum 50.',
        },
      },
    },
  },
  {
    name: 'get_verification_status',
    description:
      "The user's identity-verification state: their tier, whether they are verified, and if a submission is pending or was rejected and why. Use for \"am I verified\", \"what is my KYC status\", \"why can't I send money\", \"suis-je verifie\". Check this before telling anyone they need to verify, so the answer reflects where they actually are.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'list_payout_methods',
    description:
      'The Mobile Money numbers and bank accounts saved for paying out, with which is the default. Use for "my payout methods", "where do I withdraw to", "mes comptes de retrait". Adding one needs an SMS code and is done in the app, not here.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'accept_deal',
    description:
      'Propose accepting a deal the user was INVITED to by someone else. This commits them to its terms. Only the invited party can accept, never the creator. Call get_deal first and read the terms back to them. Does NOT execute until they approve.',
    input_schema: {
      type: 'object',
      properties: { deal_id: { type: 'string', description: 'The deal reference' } },
      required: ['deal_id'],
    },
  },
  {
    name: 'decline_deal',
    description:
      'Propose declining a deal invitation. This cannot be undone and the deal cannot be revived - a new one would have to be created. Only the invited party declines; the creator cancels instead.',
    input_schema: {
      type: 'object',
      properties: { deal_id: { type: 'string', description: 'The deal reference' } },
      required: ['deal_id'],
    },
  },
  {
    name: 'submit_delivery',
    description:
      "Propose marking a funded milestone as delivered, which starts the buyer's review period and the auto-release clock. Only the party BEING PAID can submit. The milestone must already be funded. Call get_deal first for the milestone id. Photos cannot be attached here - if they have pictures of the goods, tell them to submit from the deal screen instead so the evidence is attached.",
    input_schema: {
      type: 'object',
      properties: {
        milestone_id: { type: 'string', description: 'The milestone id, from get_deal' },
        note: {
          type: 'string',
          description: 'What was delivered, in their words. Up to 1000 characters.',
        },
      },
      required: ['milestone_id'],
    },
  },
  {
    name: 'request_revision',
    description:
      'Propose asking the seller to fix submitted work, instead of approving it or opening a dispute. Only the paying party can ask, only on submitted work, and only while revisions remain. This is the gentler option - offer it before a dispute when the user sounds like they just want it put right.',
    input_schema: {
      type: 'object',
      properties: {
        milestone_id: { type: 'string', description: 'The milestone id, from get_deal' },
        note: { type: 'string', description: 'What needs fixing, in their words.' },
      },
      required: ['milestone_id', 'note'],
    },
  },
];

function describeDispute(dispute: DisputeRow): string {
  const side = dispute.viewerRole === 'payer' ? 'they are the buyer' : 'they are the seller';
  const who = dispute.filedByYou ? 'filed by this user' : 'filed by the other party';
  return (
    `• ${dispute.contractTitle} / ${dispute.milestoneTitle}, ${money(dispute.amount, dispute.currency)}, ` +
    `${dispute.statusLabel ?? dispute.status}, reason: ${dispute.reasonLabel ?? dispute.reason}, ` +
    `${who}, ${side} (${dispute.id})`
  );
}

export const AssistantTools = {
  /**
   * Run a tool. Dispute tools are handled here; everything else is the
   * WhatsApp tool layer, unchanged and un-copied.
   */
  async run(name: string, input: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    if (!OWN_TOOLS.has(name)) return WhatsAppTools.run(name, input, context);

    try {
      switch (name) {
        case 'list_my_disputes': {
          const disputes = (await DisputeService.list(context.userId)) as unknown as DisputeRow[];
          if (disputes.length === 0) {
            return { kind: 'data', content: 'This user has no disputes, open or closed.' };
          }
          const open = disputes.filter((dispute) => !/resolved|closed|ruled/i.test(dispute.status));
          const closed = disputes.filter((dispute) => /resolved|closed|ruled/i.test(dispute.status));
          return {
            kind: 'data',
            content:
              `OPEN disputes:\n${open.map(describeDispute).join('\n') || 'none'}\n\n` +
              `CLOSED disputes:\n${closed.map(describeDispute).join('\n') || 'none'}`,
          };
        }

        case 'get_dispute': {
          const dispute = (await DisputeService.byId(
            context.userId,
            String(input.dispute_id ?? ''),
          )) as unknown as DisputeDetail;
          const conversation = (dispute.messages ?? [])
            .map(
              (message) =>
                `  [${new Date(message.createdAt).toISOString().slice(0, 10)}] ` +
                `${message.mine ? 'this user' : (message.senderName ?? 'the other party')}: ${message.body}`,
            )
            .join('\n');
          return {
            kind: 'data',
            content:
              `${describeDispute(dispute)}\n` +
              `Claim: ${dispute.description ?? '(none recorded)'}\n` +
              `Can this user withdraw it: ${dispute.canWithdraw ? 'yes' : 'no'}\n` +
              `Messages so far:\n${conversation || '  (none)'}`,
          };
        }

        case 'open_dispute': {
          const milestoneId = String(input.milestone_id ?? '').trim();
          const reason = String(input.reason ?? '').toUpperCase();
          const description = String(input.description ?? '').trim();

          if (!milestoneId) return { kind: 'error', message: 'Which milestone? Call get_deal to find its id.' };
          if (!(DISPUTE_REASONS as readonly string[]).includes(reason)) {
            return {
              kind: 'error',
              message: `Not a valid reason. Use one of: ${DISPUTE_REASONS.join(', ')}.`,
            };
          }
          if (description.length < 5) {
            return {
              kind: 'error',
              message:
                'The description is too short. Ask the user what happened and file what they actually say.',
            };
          }
          if (description.length > 2000) {
            return { kind: 'error', message: 'The description is too long - 2000 characters at most.' };
          }

          // Name the deal and the amount on the card. "Open a dispute" means
          // nothing on its own; "freeze FCFA 250,000 on the Dell laptop deal"
          // is a decision someone can actually make.
          const context_ = await findMilestone(context.userId, milestoneId);
          if (!context_) {
            return {
              kind: 'error',
              message:
                'That milestone is not on any of this user\'s deals. Call list_my_deals and get_deal to find the right id.',
            };
          }

          const summary =
            `*Open a dispute*\n\n` +
            `• Deal: *${context_.dealTitle}*\n` +
            `• Milestone: ${context_.milestone.title}, ${money(context_.milestone.amount, context_.currency)}\n` +
            `• Reason: ${reason.replace(/_/g, ' ').toLowerCase()}\n` +
            `• What you are filing: ${description}\n\n` +
            `This freezes the money in escrow and stops the automatic release while a mediator looks at it. ` +
            `The other party is told, and they can reply.\n\nOpen it?`;

          return {
            kind: 'propose',
            pending: {
              tool: name,
              args: { milestone_id: milestoneId, reason, description },
              summary,
              requiresPin: true,
            },
          };
        }

        case 'send_dispute_message': {
          const disputeId = String(input.dispute_id ?? '').trim();
          const body = String(input.body ?? '').trim();
          if (!disputeId) return { kind: 'error', message: 'Which dispute? Call list_my_disputes first.' };
          if (!body) return { kind: 'error', message: 'There is no message to send.' };
          if (body.length > 2000) {
            return { kind: 'error', message: 'That message is too long - 2000 characters at most.' };
          }

          // Read it back before it is filed. The model wrote these words and
          // they go into the record under the user's name.
          return {
            kind: 'propose',
            pending: {
              tool: name,
              args: { dispute_id: disputeId, body },
              summary:
                `*Send this to the dispute*\n\n"${body}"\n\n` +
                `Both the other party and the mediator will read it, and it stays in the record.\n\nSend it?`,
              requiresPin: false,
            },
          };
        }

        case 'withdraw_dispute': {
          const disputeId = String(input.dispute_id ?? '').trim();
          if (!disputeId) return { kind: 'error', message: 'Which dispute? Call list_my_disputes first.' };

          const dispute = (await DisputeService.byId(
            context.userId,
            disputeId,
          )) as unknown as DisputeDetail;
          if (!dispute.filedByYou) {
            return {
              kind: 'error',
              message:
                'This user did not file that dispute, so they cannot withdraw it. Only the party who filed it can.',
            };
          }

          return {
            kind: 'propose',
            pending: {
              tool: name,
              args: { dispute_id: disputeId },
              summary:
                `*Withdraw the dispute*\n\n` +
                `• Deal: *${dispute.contractTitle}*\n` +
                `• Milestone: ${dispute.milestoneTitle}, ${money(dispute.amount, dispute.currency)}\n\n` +
                `The money unfreezes and the review clock restarts, so it can be released to the seller ` +
                `automatically. You cannot undo this - a new dispute would have to be filed again.\n\nWithdraw it?`,
              requiresPin: true,
            },
          };
        }

        case 'list_transactions': {
          const limit = Math.min(Math.max(Number(input.limit) || 10, 1), 50);
          const rows = (await WalletService.transactions(context.userId)) as unknown as {
            reference: string;
            title: string;
            subtitle?: string;
            amount: number;
            currency: string;
            status: string;
            date: string;
          }[];
          if (rows.length === 0) {
            return {
              kind: 'data',
              content: 'No money has moved in or out of this wallet yet - there are no transactions.',
            };
          }
          const lines = rows
            .slice(0, limit)
            .map(
              (row) =>
                `• ${row.date}  ${row.title}${row.subtitle ? ` (${row.subtitle})` : ''}, ` +
                `${money(row.amount, row.currency)}, ${row.status} [${row.reference}]`,
            )
            .join('\n');
          const more =
            rows.length > limit ? `\n\n${rows.length - limit} older ones are not shown.` : '';
          // The sign is already in the amount; say so rather than let the model
          // guess which of these were money in and which were money out.
          return {
            kind: 'data',
            content: `The ${Math.min(limit, rows.length)} most recent transactions (a negative amount is money out):\n${lines}${more}`,
          };
        }

        case 'get_verification_status': {
          const status = (await KycService.status(context.userId)) as unknown as {
            tier?: number;
            status?: string;
            statusLabel?: string;
            verified?: boolean;
            rejectionReason?: string | null;
          };
          return {
            kind: 'data',
            content:
              `Verification tier: ${status.tier ?? 0}\n` +
              `Status: ${status.statusLabel ?? status.status ?? 'not started'}\n` +
              `Counts as verified for sending, withdrawing and creating deals: ${status.verified ? 'yes' : 'no'}` +
              (status.rejectionReason ? `\nLast rejection reason: ${status.rejectionReason}` : ''),
          };
        }

        case 'list_payout_methods': {
          const methods = (await WalletService.listPayoutMethods(context.userId)) as unknown as {
            id: string;
            type?: string;
            label?: string;
            provider?: string;
            masked?: string;
            isDefault?: boolean;
          }[];
          if (methods.length === 0) {
            return {
              kind: 'data',
              content:
                'No payout methods saved. They are added in the app under Wallet, and a Mobile Money number has to be confirmed with an SMS code first.',
            };
          }
          return {
            kind: 'data',
            content: methods
              .map(
                (method) =>
                  `• ${method.label ?? method.provider ?? method.type ?? 'Method'} ${method.masked ?? ''}` +
                  `${method.isDefault ? ' (default)' : ''}`,
              )
              .join('\n'),
          };
        }

        case 'accept_deal':
        case 'decline_deal': {
          const dealId = String(input.deal_id ?? '').trim();
          if (!dealId) return { kind: 'error', message: 'Which deal? Call list_my_deals first.' };

          const deal = (await ContractService.byId(context.userId, dealId)) as unknown as DealDetail & {
            viewerRole?: string;
            counterpartyName?: string;
            status?: string;
            statusLabel?: string;
            amount?: number;
          };

          const accepting = name === 'accept_deal';
          const total =
            deal.milestones?.reduce((sum, milestone) => sum + Number(milestone.amount || 0), 0) ?? 0;
          const currency = deal.currency ?? 'XAF';
          const side = deal.viewerRole === 'client' ? 'you pay' : 'you get paid';

          const summary = accepting
            ? `*Accept this deal*\n\n• ${deal.title}\n• ${money(total, currency)}, ${side}\n` +
              `• With: ${deal.counterpartyName ?? 'the other party'}\n\n` +
              `Accepting commits you to these terms.\n\nAccept it?`
            : `*Decline this invitation*\n\n• ${deal.title}\n• ${money(total, currency)}\n` +
              `• From: ${deal.counterpartyName ?? 'the other party'}\n\n` +
              `This cannot be undone and the deal cannot be revived. They would have to create a new one.\n\nDecline it?`;

          return {
            kind: 'propose',
            pending: {
              tool: name,
              args: { deal_id: dealId },
              summary,
              // Neither moves money by itself, and asking for a PIN to say "no
              // thanks" to an invitation would be theatre.
              requiresPin: false,
            },
          };
        }

        case 'submit_delivery': {
          const milestoneId = String(input.milestone_id ?? '').trim();
          if (!milestoneId) {
            return { kind: 'error', message: 'Which milestone? Call get_deal for its id.' };
          }
          const note = String(input.note ?? '').trim().slice(0, 1000);
          const found = await findMilestone(context.userId, milestoneId);
          if (!found) {
            return {
              kind: 'error',
              message:
                "That milestone is not on any of this user's deals. Call list_my_deals and get_deal to find the right id.",
            };
          }
          return {
            kind: 'propose',
            pending: {
              tool: name,
              args: { milestone_id: milestoneId, note },
              summary:
                `*Mark as delivered*\n\n` +
                `• Deal: *${found.dealTitle}*\n` +
                `• Milestone: ${found.milestone.title}, ${money(found.milestone.amount, found.currency)}\n` +
                (note ? `• Note: ${note}\n` : '') +
                `\nThe buyer is told and their review period starts. If they do not respond in time the money ` +
                `releases to you automatically.\n\nSubmit it?`,
              requiresPin: false,
            },
          };
        }

        case 'request_revision': {
          const milestoneId = String(input.milestone_id ?? '').trim();
          const note = String(input.note ?? '').trim();
          if (!milestoneId) {
            return { kind: 'error', message: 'Which milestone? Call get_deal for its id.' };
          }
          // Three characters is the service's own floor, and it refuses
          // anything shorter - better to say so here than to let the user
          // approve a card that is going to bounce.
          if (note.length < 3) {
            return {
              kind: 'error',
              message: 'Ask what needs fixing. A revision request with no detail helps nobody.',
            };
          }
          const found = await findMilestone(context.userId, milestoneId);
          if (!found) {
            return {
              kind: 'error',
              message: "That milestone is not on any of this user's deals.",
            };
          }
          return {
            kind: 'propose',
            pending: {
              tool: name,
              args: { milestone_id: milestoneId, note: note.slice(0, 1000) },
              summary:
                `*Ask for a revision*\n\n` +
                `• Deal: *${found.dealTitle}*\n` +
                `• Milestone: ${found.milestone.title}\n` +
                `• What needs fixing: ${note}\n\n` +
                `The money stays in escrow and the seller gets a chance to put it right.\n\nSend it?`,
              requiresPin: false,
            },
          };
        }

        default:
          return { kind: 'error', message: `Unknown tool: ${name}` };
      }
    } catch (error) {
      // The services throw AppError with text written for a user, so passing it
      // through tells the model something true ("only the buyer can do that")
      // instead of a generic failure it will apologise vaguely about.
      return { kind: 'error', message: (error as Error).message };
    }
  },

  /**
   * Run an approved action. The only path from a proposal to a real change.
   */
  async executeConfirmed(pending: PendingAction, context: ToolContext): Promise<string> {
    if (!OWN_TOOLS.has(pending.tool)) return WhatsAppTools.executeConfirmed(pending, context);

    const args = pending.args;
    switch (pending.tool) {
      case 'open_dispute': {
        await EscrowService.fileDispute(context.userId, String(args.milestone_id), {
          reason: String(args.reason),
          description: String(args.description),
        });
        return (
          'Dispute opened. The money is frozen in escrow while it is reviewed, and the other party has been told. ' +
          'You can add more detail to it at any time.'
        );
      }

      case 'send_dispute_message': {
        await DisputeService.addMessage(context.userId, String(args.dispute_id), {
          body: String(args.body),
        });
        return 'Sent. It is in the dispute record now, and the other party has been notified.';
      }

      case 'withdraw_dispute': {
        await DisputeService.withdraw(context.userId, String(args.dispute_id));
        return 'Dispute withdrawn. The money is unfrozen and the review period has restarted.';
      }

      case 'accept_deal': {
        await ContractService.accept(context.userId, String(args.deal_id));
        return 'Deal accepted. The buyer can fund it now, and you will both be told when they do.';
      }

      case 'decline_deal': {
        await ContractService.decline(context.userId, String(args.deal_id));
        return 'Invitation declined. They have been told, and this deal cannot be revived.';
      }

      case 'submit_delivery': {
        const note = typeof args.note === 'string' ? args.note : '';
        await ContractService.submitWork(context.userId, String(args.milestone_id), {
          note: note || undefined,
        });
        return 'Marked as delivered. The buyer has been told and their review period has started.';
      }

      case 'request_revision': {
        // The service calls this `feedback`, and it is required - a revision
        // request with nothing in it tells the seller nothing to fix.
        await ContractService.requestRevision(context.userId, String(args.milestone_id), {
          feedback: String(args.note),
        });
        return 'Revision requested. The money stays in escrow while they put it right.';
      }

      default:
        throw new Error(`Cannot execute: ${pending.tool}`);
    }
  },
};

/**
 * Find a milestone among the deals this user is actually on.
 *
 * Doubles as an authorisation check: a milestone id that does not appear on one
 * of their own deals is not theirs to dispute, and this fails before anything
 * is proposed rather than after the user has approved it.
 */
async function findMilestone(
  userId: string,
  milestoneId: string,
): Promise<{ dealTitle: string; currency: string; milestone: MilestoneRow } | null> {
  const { ContractService } = await import('../contract/contract.service');
  const list = (await ContractService.list(userId)) as unknown as {
    mine: { id: string }[];
    invited: { id: string }[];
  };

  for (const deal of [...list.mine, ...list.invited]) {
    const detail = (await ContractService.byId(userId, deal.id)) as unknown as DealDetail;
    const milestone = detail.milestones?.find((candidate) => candidate.id === milestoneId);
    if (milestone) {
      return {
        dealTitle: detail.title,
        currency: milestone.currency ?? detail.currency ?? 'XAF',
        milestone,
      };
    }
  }
  return null;
}
