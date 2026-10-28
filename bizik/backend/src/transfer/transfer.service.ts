import { Currency, Transfer } from '@prisma/client';

import { accountBlockedReason, canAccountAct } from '../lib/account-status';
import { isVerifiedTier } from '../lib/kyc-gate';
import { round2 } from '../lib/fees';
import { creditWallet, debitWallet, lockWalletsInOrder } from '../lib/ledger';
import { normalizePhone } from '../lib/phone';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { isCurrencyEnabled, systemSettings } from '../lib/system-settings';
import { NotificationService } from '../notification/notification.service';
import { UsernameService } from '../user/username.service';

/**
 * Wallet-to-wallet payments between BiZik users - the "send money" half of the
 * product, alongside escrow. A transfer is deliberately simple and final: money
 * leaves one wallet and lands in another in a single database transaction, with
 * no hold, no approval and no reversal. Escrow exists precisely for the cases
 * that need protection; conflating the two would make both harder to explain.
 */

export interface SendMoneyInput {
  /** A handle ("@maxime.b") or a phone number - whatever the sender typed. */
  to: string;
  amount: number;
  currency: Currency;
  note?: string;
  /** Optional client key so a retried request cannot pay twice. */
  idempotencyKey?: string;
}

/** Prisma's code for "a unique constraint would be violated". */
function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string })?.code === 'P2002';
}

/** What a completed send looks like to the sender - one shape, always. */
export interface SendResult {
  id: string;
  amount: number;
  currency: Currency;
  note: string | null;
  reference: string | null;
  recipient: { fullName: string; username: string | null; label: string };
  balanceAfter: number;
  createdAt: string;
}

/** A recipient, as shown to the sender BEFORE they confirm. */
export interface ResolvedRecipient {
  id: string;
  fullName: string;
  username: string | null;
}

export const TransferService = {
  /**
   * Who is behind this handle or number? Deliberately returns only a name - a
   * lookup must never become a way to harvest phone numbers or emails.
   */
  async resolveRecipient(query: string): Promise<ResolvedRecipient | null> {
    const raw = query.trim();
    if (!raw) return null;

    const byHandle = await UsernameService.findByHandle(raw);
    if (byHandle) {
      return { id: byHandle.id, fullName: byHandle.fullName, username: byHandle.username };
    }
    // Only try a phone reading when it actually looks like one, so a mistyped
    // handle doesn't silently resolve to somebody's number.
    if (!/^[+\d][\d\s\-().]{6,}$/.test(raw)) return null;
    const phone = normalizePhone(raw);
    const byPhone = await prisma.user.findUnique({
      where: { phone },
      select: { id: true, fullName: true, username: true },
    });
    return byPhone ?? null;
  },

  /** The sender's own handle + balances, for "how do people pay me?". */
  async myHandle(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, fullName: true },
    });
    if (!user) throw new AppError(404, 'Q-404', 'Account not found');
    const username = user.username ?? (await UsernameService.ensureFor(userId, user.fullName));
    return { username, fullName: user.fullName };
  },

  /**
   * Move money from one wallet to another. Both ledger writes happen in ONE
   * database transaction, so a transfer can never debit without crediting.
   */
  async send(senderId: string, input: SendMoneyInput): Promise<SendResult> {
    const amount = round2(Number(input.amount));
    if (!(amount > 0)) throw new AppError(400, 'Q-400', 'Enter an amount greater than 0.');
    if (!isCurrencyEnabled(input.currency)) {
      throw new AppError(400, 'Q-400', 'That currency is not available on BiZik right now.');
    }

    // A retry of a request we already paid must return the original, not pay again.
    if (input.idempotencyKey) {
      const previous = await prisma.transfer.findUnique({
        where: { senderId_idempotencyKey: { senderId, idempotencyKey: input.idempotencyKey } },
      });
      if (previous) return this.describeSend(previous, senderId);
    }

    const [sender, recipient] = await Promise.all([
      prisma.user.findUnique({
        where: { id: senderId },
        select: { id: true, fullName: true, username: true, status: true, kycTier: true },
      }),
      this.resolveRecipient(input.to),
    ]);
    if (!sender) throw new AppError(404, 'Q-404', 'Account not found');
    if (!canAccountAct(sender.status)) {
      throw new AppError(403, 'Q-403', accountBlockedReason(sender.status) ?? 'This account cannot send money.');
    }
    // Sending money out of an account requires a verified identity - the same
    // bar as creating a deal. The RECIPIENT is deliberately not checked: money
    // already sent must be able to land, so an unverified handle can receive.
    if (!isVerifiedTier(sender.kycTier)) {
      throw new AppError(
        403,
        'Q-422-KYC',
        'Verify your account before sending money. Your identity check keeps everyone on BiZik safe - you can still receive money in the meantime.',
      );
    }
    if (!recipient) {
      throw new AppError(404, 'Q-404', `No BiZik account found for "${input.to}". Check the handle or number.`);
    }
    if (recipient.id === senderId) {
      throw new AppError(400, 'Q-400', "You can't send money to yourself.");
    }

    const recipientAccount = await prisma.user.findUnique({
      where: { id: recipient.id },
      select: { status: true },
    });
    if (recipientAccount && !canAccountAct(recipientAccount.status)) {
      throw new AppError(409, 'Q-409', `${recipient.fullName} cannot receive money right now.`);
    }

    const label = recipient.username ? `@${recipient.username}` : recipient.fullName;
    const senderLabel = sender.username ? `@${sender.username}` : sender.fullName;

    let result;
    try {
      result = await this.commitTransfer(senderId, recipient.id, amount, input, label, senderLabel);
    } catch (error) {
      // Two clicks (or a retry racing the original) reach the unique index at
      // the same moment: both passed the idempotency read, one committed, this
      // one lost. The money moved exactly once - return that transfer instead of
      // a 500, which is what the caller would have got had it arrived a moment
      // later.
      if (isUniqueViolation(error) && input.idempotencyKey) {
        const winner = await prisma.transfer.findUnique({
          where: { senderId_idempotencyKey: { senderId, idempotencyKey: input.idempotencyKey } },
        });
        if (winner) return this.describeSend(winner, senderId);
      }
      throw error;
    }

    // Tell both sides, best-effort - the money has already moved.
    void NotificationService.notifyTransfer({
      transferId: result.transfer.id,
      senderId,
      senderLabel,
      senderName: sender.fullName,
      recipientId: recipient.id,
      recipientLabel: label,
      amount,
      currency: input.currency,
      note: result.transfer.note,
      senderBalanceAfter: result.senderBalance,
      recipientBalanceAfter: result.recipientBalance,
    });

    return {
      id: result.transfer.id,
      amount,
      currency: input.currency,
      note: result.transfer.note,
      reference: result.transfer.senderReference,
      recipient: { fullName: recipient.fullName, username: recipient.username, label },
      balanceAfter: result.senderBalance,
      createdAt: result.transfer.createdAt.toISOString(),
    };
  },

  /**
   * The money move itself, in ONE database transaction: debit, credit and the
   * transfer record commit together or not at all, so a transfer can never
   * debit without crediting.
   */
  async commitTransfer(
    senderId: string,
    recipientId: string,
    amount: number,
    input: SendMoneyInput,
    label: string,
    senderLabel: string,
  ) {
    return prisma.$transaction(async (tx) => {
      // Take both wallet locks up front in a fixed order (by user id). Locking
      // in the order the money happens to flow means a simultaneous A→B and B→A
      // grab each other's rows and deadlock; a global order makes one of them
      // simply wait.
      await lockWalletsInOrder(tx, [senderId, recipientId], input.currency);

      // debitWallet refuses to go negative, so an insufficient balance aborts
      // the whole transaction before anything is credited.
      const out = await debitWallet(tx, {
        userId: senderId,
        currency: input.currency,
        amount,
        type: 'TRANSFER_OUT',
        referenceType: 'transfer',
        referenceId: recipientId,
        description: `Sent to ${label}`,
      });
      const incoming = await creditWallet(tx, {
        userId: recipientId,
        currency: input.currency,
        amount,
        type: 'TRANSFER_IN',
        referenceType: 'transfer',
        referenceId: senderId,
        description: `Received from ${senderLabel}`,
      });
      const transfer = await tx.transfer.create({
        data: {
          senderId,
          recipientId,
          amount,
          currency: input.currency,
          note: input.note?.trim() || null,
          senderReference: out.reference,
          recipientReference: incoming.reference,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      return { transfer, senderBalance: out.balanceAfter, recipientBalance: incoming.balanceAfter };
    });
  },

  /**
   * The sender's view of a completed transfer. Used for a fresh send and for a
   * replayed one, so both return the same thing.
   */
  async describeSend(transfer: Transfer, senderId: string): Promise<SendResult> {
    const recipient = await prisma.user.findUnique({
      where: { id: transfer.recipientId },
      select: { fullName: true, username: true },
    });
    const wallet = await prisma.wallet.findUnique({
      where: { userId_currency: { userId: senderId, currency: transfer.currency } },
    });
    const label = recipient?.username ? `@${recipient.username}` : recipient?.fullName ?? 'BiZik user';
    return {
      id: transfer.id,
      amount: Number(transfer.amount),
      currency: transfer.currency,
      note: transfer.note,
      reference: transfer.senderReference,
      recipient: {
        fullName: recipient?.fullName ?? 'BiZik user',
        username: recipient?.username ?? null,
        label,
      },
      balanceAfter: wallet ? Number(wallet.balance) : 0,
      createdAt: transfer.createdAt.toISOString(),
    };
  },

  /** One transfer, from the viewer's side. */
  async shape(transferId: string, viewerId: string) {
    const transfer = await prisma.transfer.findUnique({ where: { id: transferId } });
    if (!transfer) throw new AppError(404, 'Q-404', 'Transfer not found');
    if (transfer.senderId !== viewerId && transfer.recipientId !== viewerId) {
      throw new AppError(403, 'Q-403', 'This transfer is not yours.');
    }
    const outgoing = transfer.senderId === viewerId;
    const other = await prisma.user.findUnique({
      where: { id: outgoing ? transfer.recipientId : transfer.senderId },
      select: { fullName: true, username: true },
    });
    const label = other?.username ? `@${other.username}` : other?.fullName ?? 'BiZik user';
    return {
      id: transfer.id,
      direction: outgoing ? ('out' as const) : ('in' as const),
      amount: Number(transfer.amount),
      currency: transfer.currency,
      note: transfer.note,
      reference: outgoing ? transfer.senderReference : transfer.recipientReference,
      counterparty: { fullName: other?.fullName ?? 'BiZik user', username: other?.username ?? null, label },
      createdAt: transfer.createdAt.toISOString(),
    };
  },

  /** This user's transfer history, newest first (both directions). */
  async list(userId: string, limit = 30) {
    const transfers = await prisma.transfer.findMany({
      where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
    });
    return Promise.all(transfers.map((transfer) => this.shape(transfer.id, userId)));
  },
};
