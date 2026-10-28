import crypto from 'crypto';

import { Currency, PayoutMethod, PayoutMethodType } from '@prisma/client';

import { config } from '../config/env';
import { feeSettings } from '../lib/settings';
import { emitAdminEvent } from '../lib/admin-events';
import { isCurrencyEnabled } from '../lib/system-settings';
import { decryptField, encryptField, maskIdNumber } from '../lib/crypto';
import { CURRENCY_META, dateGroup, fromUsd, homeCurrencyFor, toUsd } from '../lib/domain';
import { AppError } from '../lib/errors';
import { claimCodeSend, clearCodeCooldown, codeCooldownError } from '../lib/code-cooldown';
import { assertCanTransact } from '../lib/kyc-gate';
import { sendVerificationCode } from '../lib/verification-code';
import { expressWithdrawalFee, round2 } from '../lib/fees';
import { humanizeMethod } from '../lib/method-format';
import { fxQuote } from '../lib/fx';
import { hashToken, numericOtp, signReceiptToken } from '../lib/jwt';
import { creditWallet, debitWallet } from '../lib/ledger';
import { buildReceiptPdf } from '../lib/receipt-pdf';
import * as payments from '../lib/payments';
import { normalizePhone } from '../lib/phone';
import { prisma } from '../lib/prisma';
import { redis } from '../lib/redis';
import { PaymentService } from '../payments/application/payment.service';
import { NotificationService } from '../notification/notification.service';
import { WalletRepository } from './wallet.repository';
import {
  AddFundsInput,
  AddPayoutMethodInput,
  ConvertInput,
  PayoutInput,
} from './wallet.validation';

// 24h change is illustrative (no rate history table yet) - stable per currency.
const CHANGE_PCT: Record<Currency, number> = {
  USD: 1.8, NGN: -0.4, EUR: 0.9, GHS: 0.3, GBP: 2.1, XAF: 0.1,
};

/** Mobile-money payout types must prove the number is the user's (OTP by SMS). */
const MOMO_TYPES = new Set<PayoutMethodType>(['MTN_MOMO', 'ORANGE_MONEY']);
const pmOtpKey = (challengeId: string) => `wallet:pm-otp:${challengeId}`;
const PM_OTP_MAX_ATTEMPTS = 5;

/** Per-category caps on saved payment methods. */
const MOMO_LIMIT = 3;
const BANK_LIMIT = 2;

/** Canonical form for comparing two account details (phone digits / lowercased). */
function normalizeDetail(type: PayoutMethodType, detail: string): string {
  if (MOMO_TYPES.has(type)) return detail.replace(/\s+/g, ''); // phone: "+237650…"
  return detail.trim().toLowerCase(); // bank account number / Payoneer email
}

/**
 * Reject a method whose number/account the user has ALREADY saved. Account
 * details are encrypted with a random IV (not queryable), so we decrypt the
 * user's existing methods and compare the canonical forms.
 */
async function assertNotDuplicate(
  userId: string,
  type: PayoutMethodType,
  accountDetail: string,
): Promise<void> {
  const target = normalizeDetail(type, accountDetail);
  const existing = await prisma.payoutMethod.findMany({
    where: { userId, deletedAt: null },
    select: { type: true, accountDetail: true },
  });
  const alreadySaved = existing.some(
    (method) => normalizeDetail(method.type, decryptField(method.accountDetail)) === target,
  );
  if (alreadySaved) {
    const label = MOMO_TYPES.has(type) ? 'number' : 'account';
    throw new AppError(409, 'Q-409', `This ${label} is already saved as a payment method.`);
  }
}

/** Reject adding a method once the user is at the cap for its category. */
async function assertWithinLimit(userId: string, type: PayoutMethodType): Promise<void> {
  if (MOMO_TYPES.has(type)) {
    const count = await prisma.payoutMethod.count({
      where: { userId, deletedAt: null, type: { in: ['MTN_MOMO', 'ORANGE_MONEY'] } },
    });
    if (count >= MOMO_LIMIT) {
      throw new AppError(400, 'Q-400', `You can add up to ${MOMO_LIMIT} mobile money numbers.`);
    }
  } else if (type === 'BANK') {
    const count = await prisma.payoutMethod.count({ where: { userId, deletedAt: null, type: 'BANK' } });
    if (count >= BANK_LIMIT) {
      throw new AppError(400, 'Q-400', `You can add up to ${BANK_LIMIT} bank accounts.`);
    }
  }
}

/** "+237•••••386" - enough to recognise the number without exposing it. */
function maskPhone(phone: string): string {
  const trimmed = phone.replace(/\s+/g, '');
  if (trimmed.length <= 4) return trimmed;
  return `${trimmed.slice(0, 4)}${'•'.repeat(Math.max(2, trimmed.length - 7))}${trimmed.slice(-3)}`;
}

/** Group a full E.164 number for readable display, e.g. "+237 650 000 001". */
function formatPhoneForDisplay(phone: string): string {
  const trimmed = phone.replace(/\s+/g, '');
  const match = trimmed.match(/^(\+\d{1,3})(\d+)$/);
  if (!match) return trimmed;
  const [, countryCode, national] = match;
  // Group in threes from the RIGHT so no lone digit is orphaned at the end.
  const groups: string[] = [];
  for (let end = national.length; end > 0; end -= 3) {
    groups.unshift(national.slice(Math.max(0, end - 3), end));
  }
  return `${countryCode} ${groups.join(' ')}`;
}

interface PendingPayoutMethodOtp {
  userId: string;
  input: AddPayoutMethodInput;
  codeHash: string;
  attempts: number;
}

const PAYOUT_KIND: Record<PayoutMethodType, { kind: string; icon: string; color: string }> = {
  MTN_MOMO: { kind: 'momo', icon: 'phone-portrait', color: '#F59E0B' },
  ORANGE_MONEY: { kind: 'momo', icon: 'phone-portrait', color: '#F59E0B' },
  BANK: { kind: 'bank', icon: 'business', color: '#3B82F6' },
  PAYONEER: { kind: 'payoneer', icon: 'card', color: '#6366F1' },
};

/** Client-facing payout-method shape: account detail decrypted, masked for
 * bank/Payoneer but shown in FULL for mobile money - the owner needs to confirm
 * the exact number they'll be paid on, and it's only ever returned to that owner. */
function shapePayoutMethod(p: PayoutMethod) {
  const meta = PAYOUT_KIND[p.type];
  const decrypted = decryptField(p.accountDetail);
  const isMomo = meta.kind === 'momo';
  return {
    id: p.id,
    kind: meta.kind,
    type: p.type,
    name: p.accountName ?? p.type,
    detail: isMomo ? formatPhoneForDisplay(decrypted) : maskIdNumber(decrypted),
    icon: meta.icon,
    color: meta.color,
    currency: p.currency,
    country: p.country,
    verified: p.verified,
    isDefault: p.isDefault,
  };
}

const TXN_TITLE: Record<string, string> = {
  milestone: 'Milestone release',
  escrow_fund: 'Escrow funding',
  topup: 'Wallet top-up',
  payout: 'Withdrawal',
  fx: 'Currency conversion',
  fee: 'Service fee',
  refund: 'Refund',
  release: 'Milestone release',
  deposit: 'Deposit',
  withdrawal: 'Withdrawal',
};
const TXN_ICON: Record<string, string> = {
  milestone: 'checkmark-done',
  escrow_fund: 'lock-closed',
  topup: 'add-circle',
  payout: 'arrow-up',
  fx: 'swap-horizontal',
  fee: 'pricetag',
  refund: 'return-down-back',
  release: 'checkmark-done',
  deposit: 'arrow-down',
  withdrawal: 'arrow-up',
};

export const WalletService = {
  async overview(userId: string) {
    const [wallets, payoutMethods, held, user] = await Promise.all([
      WalletRepository.getWallets(userId),
      WalletRepository.getPayoutMethods(userId),
      WalletRepository.getHeldMilestones(userId),
      prisma.user.findUnique({ where: { id: userId }, select: { country: true } }),
    ]);

    const availableUsd = wallets.reduce(
      (s, w) => s + toUsd(Number(w.balance), w.currency),
      0,
    );
    const pendingPayoutUsd = wallets.reduce(
      (s, w) => s + toUsd(Number(w.pendingBalance), w.currency),
      0,
    );
    const inEscrowUsd = held.reduce(
      (s, m) => s + toUsd(Number(m.amount), m.currency),
      0,
    );

    // Display everything in the currency the user actually holds the most of,
    // so the headline matches their wallet + transactions. Fall back to their
    // country's currency only when they have no balance yet.
    const nonZero = wallets.filter((w) => Number(w.balance) > 0);
    const home = nonZero.length
      ? nonZero.reduce((best, w) =>
          toUsd(Number(w.balance), w.currency) > toUsd(Number(best.balance), best.currency)
            ? w
            : best,
        ).currency
      : homeCurrencyFor(user?.country);
    const toHome = (usd: number) => round(fromUsd(usd, home));

    return {
      summary: {
        availableUsd: round(availableUsd),
        inEscrowUsd: round(inEscrowUsd),
        pendingPayoutUsd: round(pendingPayoutUsd),
        portfolioUsd: round(availableUsd + inEscrowUsd),
        homeCurrency: home,
        availableHome: toHome(availableUsd),
        inEscrowHome: toHome(inEscrowUsd),
        pendingPayoutHome: toHome(pendingPayoutUsd),
        portfolioHome: toHome(availableUsd + inEscrowUsd),
      },
      wallets: wallets.map((w) => ({
        currency: w.currency,
        label: CURRENCY_META[w.currency].label,
        flag: CURRENCY_META[w.currency].flag,
        balance: Number(w.balance),
        changePct: CHANGE_PCT[w.currency] ?? 0,
      })),
      payoutMethods: payoutMethods.map(shapePayoutMethod),
    };
  },

  // ---- Payout methods (SRS MOD-06) ----
  async listPayoutMethods(userId: string) {
    const methods = await WalletRepository.getPayoutMethods(userId);
    return methods.map(shapePayoutMethod);
  },

  async addPayoutMethod(
    userId: string,
    input: AddPayoutMethodInput,
    opts: { verified?: boolean } = {},
  ) {
    await assertWithinLimit(userId, input.type);
    await assertNotDuplicate(userId, input.type, input.accountDetail);
    // Mobile money doesn't collect a name - use the account owner's verified name.
    let accountName = input.accountName;
    if (!accountName) {
      const owner = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      accountName = owner?.fullName ?? 'Account holder';
    }
    const existing = await WalletRepository.countPayoutMethods(userId);
    const makeDefault = input.makeDefault ?? existing === 0;
    const created = await WalletRepository.createPayoutMethod({
      userId,
      type: input.type,
      provider: input.provider,
      accountName,
      accountDetail: encryptField(input.accountDetail),
      currency: input.currency,
      country: input.country,
      isDefault: makeDefault,
      verified: opts.verified ?? false,
    });
    // Clear the default flag on the user's other methods if this one took it.
    if (makeDefault && existing > 0) {
      await WalletRepository.setDefaultPayoutMethod(userId, created.id);
    }
    return shapePayoutMethod(created);
  },

  // ---- Mobile-money OTP verification (SRS MOD-06 / FR-KYC) ----

  /**
   * Begin adding a payout method. Mobile-money numbers must be confirmed by an
   * SMS OTP to that number (proving it belongs to the user) before the method is
   * saved; bank / Payoneer methods are created immediately.
   */
  async startPayoutMethodVerification(userId: string, input: AddPayoutMethodInput) {
    // Fail fast (before sending an OTP) if the category is at its cap or the
    // number is already saved.
    await assertWithinLimit(userId, input.type);
    await assertNotDuplicate(userId, input.type, input.accountDetail);
    if (!MOMO_TYPES.has(input.type)) {
      // Bank / Payoneer aren't OTP-verified - they're confirmed on creation, so
      // mark them verified now (otherwise they'd sit on "Pending" forever).
      const method = await this.addPayoutMethod(userId, input, { verified: true });
      return { requiresOtp: false as const, method };
    }

    const phone = normalizePhone(input.accountDetail);
    // Shares the escalating cooldown with every other code we send, so adding
    // a payout method cannot be used to bypass the wait on the sign-in code -
    // and so a number that has just been hammered is not hammered again here.
    const claim = await claimCodeSend('payout-method', phone);
    if (!claim.allowed) {
      throw codeCooldownError(claim);
    }
    const code = numericOtp(6);
    const challengeId = crypto.randomUUID();
    const pending: PendingPayoutMethodOtp = { userId, input, codeHash: hashToken(code), attempts: 0 };
    await redis.set(pmOtpKey(challengeId), JSON.stringify(pending), {
      EX: config.otpTtlMinutes * 60,
    });

    // Fire-and-forget: the code is already in Redis, so verification works
    // whether or not the SMS delivered instantly.
    // WhatsApp first, SMS second - this code proves where real money will be
    // sent, so its delivery matters more than any other.
    void sendVerificationCode(phone, code, { purpose: 'payout number' }).catch((error) =>
      console.error('[wallet] payout-method OTP failed:', (error as Error).message),
    );

    return {
      requiresOtp: true as const,
      challengeId,
      phone: maskPhone(phone),
      retryAfterSeconds: claim.nextWaitSeconds,
    };
  },

  /** Confirm the SMS code and, on success, save the (now verified) method. */
  async verifyPayoutMethodOtp(userId: string, challengeId: string, code: string) {
    const raw = await redis.get(pmOtpKey(challengeId));
    if (!raw) {
      throw new AppError(400, 'Q-400', 'This code has expired. Please request a new one.');
    }
    const pending = JSON.parse(raw) as PendingPayoutMethodOtp;
    if (pending.userId !== userId) {
      throw new AppError(403, 'Q-403', 'This verification does not belong to you.');
    }
    if (pending.attempts >= PM_OTP_MAX_ATTEMPTS) {
      await redis.del(pmOtpKey(challengeId));
      throw new AppError(429, 'Q-429', 'Too many incorrect attempts. Please start again.');
    }
    if (hashToken(code.trim()) !== pending.codeHash) {
      pending.attempts += 1;
      await redis.set(pmOtpKey(challengeId), JSON.stringify(pending), { KEEPTTL: true });
      throw new AppError(400, 'Q-400', 'Incorrect code. Please try again.');
    }

    await redis.del(pmOtpKey(challengeId));
    await clearCodeCooldown('payout-method', normalizePhone(pending.input.accountDetail));
    return this.addPayoutMethod(userId, pending.input, { verified: true });
  },

  /** Resend a fresh code to the same number (resets the attempt counter). */
  async resendPayoutMethodOtp(userId: string, challengeId: string) {
    const raw = await redis.get(pmOtpKey(challengeId));
    if (!raw) {
      throw new AppError(400, 'Q-400', 'This verification has expired. Please start again.');
    }
    const pending = JSON.parse(raw) as PendingPayoutMethodOtp;
    if (pending.userId !== userId) {
      throw new AppError(403, 'Q-403', 'This verification does not belong to you.');
    }

    const phone = normalizePhone(pending.input.accountDetail);
    // This resend had no limit at all: the button could be held down and every
    // press sent a real message to a real number. It now escalates like every
    // other code - one minute, then five.
    const claim = await claimCodeSend('payout-method', phone);
    if (!claim.allowed) {
      throw codeCooldownError(claim);
    }
    const code = numericOtp(6);
    pending.codeHash = hashToken(code);
    pending.attempts = 0;
    await redis.set(pmOtpKey(challengeId), JSON.stringify(pending), {
      EX: config.otpTtlMinutes * 60,
    });

    void sendVerificationCode(phone, code, { purpose: 'payout number resend' }).catch((error) =>
      console.error('[wallet] payout-method OTP resend failed:', (error as Error).message),
    );

    return { challengeId, phone: maskPhone(phone), retryAfterSeconds: claim.nextWaitSeconds };
  },

  async removePayoutMethod(userId: string, id: string) {
    const method = await WalletRepository.findPayoutMethod(id);
    if (!method || method.userId !== userId) {
      throw new AppError(404, 'Q-404', 'Payout method not found');
    }
    await WalletRepository.deletePayoutMethod(id);
    // If we removed the default, promote another method (if any remain).
    if (method.isDefault) {
      const next = await WalletRepository.promoteAnyDefault(userId);
      if (next) await WalletRepository.setDefaultPayoutMethod(userId, next.id);
    }
    return this.listPayoutMethods(userId);
  },

  async setDefaultPayoutMethod(userId: string, id: string) {
    const method = await WalletRepository.findPayoutMethod(id);
    if (!method || method.userId !== userId) {
      throw new AppError(404, 'Q-404', 'Payout method not found');
    }
    await WalletRepository.setDefaultPayoutMethod(userId, id);
    return this.listPayoutMethods(userId);
  },

  async transactions(userId: string) {
    const now = new Date();
    const rows = await WalletRepository.getTransactions(userId);

    // Deposit/withdrawal ledger rows carry a PaymentTransaction reference; join
    // its live status so a held/processing/failed payment isn't shown as
    // "completed" like a pure ledger move (release/fee/fx/refund) is.
    const paymentReferences = rows
      .map((row) => row.referenceId)
      .filter((referenceId): referenceId is string => Boolean(referenceId));
    const linkedPayments = paymentReferences.length
      ? await prisma.paymentTransaction.findMany({
          where: { transactionReference: { in: paymentReferences } },
          select: { transactionReference: true, status: true },
        })
      : [];
    const statusByReference = new Map(linkedPayments.map((payment) => [payment.transactionReference, payment.status]));

    const displayStatus = (row: (typeof rows)[number]): 'completed' | 'pending' | 'processing' | 'failed' => {
      if (row.type !== 'DEPOSIT' && row.type !== 'WITHDRAWAL') return 'completed';
      const paymentStatus = row.referenceId ? statusByReference.get(row.referenceId) : undefined;
      switch (paymentStatus) {
        case 'PENDING':
          return 'pending';
        case 'PROCESSING':
          return 'processing';
        case 'FAILED':
        case 'REVERSED':
          return 'failed';
        default:
          return 'completed'; // SUCCESSFUL or a legacy row with no linked payment
      }
    };

    return rows.map((t) => {
      const ref = t.referenceType ?? t.type.toLowerCase();
      return {
        id: t.id,
        reference: t.reference,
        title: TXN_TITLE[ref] ?? 'Transaction',
        subtitle: humanizeMethod(t.description ?? ''),
        amount: Number(t.amount),
        currency: t.currency,
        type: ref,
        status: displayStatus(t),
        icon: TXN_ICON[ref] ?? 'cash',
        date: t.createdAt.toISOString().slice(0, 10),
        group: dateGroup(t.createdAt, now),
      };
    });
  },

  // ---- Transaction receipt (PDF) ----

  /** A short-lived token authorising the receipt PDF for one transaction. */
  async issueReceiptToken(userId: string, reference: string): Promise<string> {
    const transaction = await prisma.walletTransaction.findFirst({
      where: { reference, wallet: { userId } },
    });
    if (!transaction) throw new AppError(404, 'Q-404', 'Transaction not found');
    return signReceiptToken(userId, reference);
  },

  /** Render the receipt PDF for a transaction the user owns. */
  async buildReceipt(userId: string, reference: string): Promise<{ pdf: Uint8Array; fileName: string }> {
    const transaction = await prisma.walletTransaction.findFirst({
      where: { reference, wallet: { userId } },
    });
    if (!transaction) throw new AppError(404, 'Q-404', 'Transaction not found');

    const kind = transaction.referenceType ?? transaction.type.toLowerCase();
    const description = transaction.description ?? '';
    // Descriptions read like "Wallet withdrawal · MTN_MOBILE_MONEY" - take the tail as the method.
    const method = description.includes('·') ? description.split('·').pop()?.trim() : undefined;
    const pdf = await buildReceiptPdf({
      title: TXN_TITLE[kind] ?? 'Transaction',
      reference,
      dateLabel: transaction.createdAt.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      amount: Number(transaction.amount),
      currency: transaction.currency,
      method: method || null,
      statusLabel: 'Completed',
    });
    return { pdf, fileName: `bizik-receipt-${reference}.pdf` };
  },

  // ---- Top up, withdraw, convert ----

  /** Top up a wallet from an external payment method (simulated gateway). */
  async addFunds(userId: string, input: AddFundsInput) {
    // SECURITY: this legacy path uses the SIMULATED gateway and credits instantly,
    // regardless of provider confirmation. In live mode it would let anyone top up
    // a real wallet for free - so it is disabled outside simulated mode. Real
    // deposits must go through the provider-agnostic /payments/deposits flow.
    if (config.payments.mode === 'live') {
      throw new AppError(400, 'Q-400', 'Please fund your wallet from the deposit screen.');
    }
    if (!isCurrencyEnabled(input.currency)) {
      throw new AppError(400, 'Q-400', 'That currency is not available on BiZik right now.');
    }

    // Charge the chosen payment method (MoMo / bank / …); the gateway is picked
    // to match that rail. Falls back to a currency-routed charge when none given.
    let chargeMethod: ReturnType<typeof payments.methodFromPayoutType> | undefined;
    let methodLabel = 'Wallet top-up';
    if (input.payoutMethodId) {
      const method = await prisma.payoutMethod.findFirst({
        where: { id: input.payoutMethodId, userId, deletedAt: null },
      });
      if (!method) throw new AppError(404, 'Q-404', 'Payment method not found.');
      chargeMethod = payments.methodFromPayoutType(method.type, method.provider);
      methodLabel = `Wallet top-up · ${method.accountName ?? humanizeMethod(method.type)}`;
    }

    const charge = await payments.charge({
      amount: input.amount,
      currency: input.currency,
      method: chargeMethod?.method,
      provider: chargeMethod?.provider,
    });
    if (charge.status !== 'SUCCEEDED') {
      throw new AppError(402, 'Q-402', charge.failureReason ?? 'Payment failed. Please try again.');
    }
    const result = await prisma.$transaction((tx) =>
      creditWallet(tx, {
        userId,
        currency: input.currency,
        amount: input.amount,
        type: 'DEPOSIT',
        referenceType: 'topup',
        description: methodLabel,
      }),
    );
    void NotificationService.notifyWalletEvent({
      userId,
      kind: 'deposit',
      amount: input.amount,
      currency: input.currency,
      reference: result.reference,
      balanceAfter: result.balanceAfter,
    });
    return this.overview(userId);
  },

  /** Withdraw from a wallet to a verified payout method (FR-PAY-008). */
  async requestPayout(userId: string, input: PayoutInput) {
    // LIVE MODE: this legacy queue settles through the simulated gateway, which
    // reports success without sending anything - the user's balance would be
    // debited and no money would arrive. Hand the request to the real rail
    // instead, which reserves funds, calls Fapshi and holds large payouts for
    // approval. Callers (the app and the WhatsApp assistant) are unaffected.
    if (config.payments.mode === 'live') {
      await PaymentService.createWithdrawal({
        userId,
        amount: input.amount,
        currency: input.currency,
        payoutMethodId: input.payoutMethodId,
      });
      return this.overview(userId);
    }
    // Money leaving the platform always requires a verified identity, and a
    // frozen or suspended account must not be able to take funds out.
    await assertCanTransact(userId, 'withdraw');
    const method = await WalletRepository.findPayoutMethod(input.payoutMethodId);
    if (!method || method.userId !== userId) {
      throw new AppError(404, 'Q-404', 'Payout method not found');
    }
    const minWithdrawalUsd = feeSettings().minWithdrawalUsd;
    if (toUsd(input.amount, input.currency) < minWithdrawalUsd) {
      throw new AppError(400, 'Q-400', `Minimum withdrawal is $${minWithdrawalUsd}.`);
    }
    const wallet = await prisma.wallet.findUnique({
      where: { userId_currency: { userId, currency: input.currency } },
    });
    if (!wallet) throw new AppError(400, 'Q-400', 'You have no wallet in this currency.');

    const fee = input.express ? expressWithdrawalFee(input.amount) : 0;

    // The amount leaves the wallet now and the request enters the payout queue
    // as INITIATED; the actual gateway disbursement happens once an operator
    // approves it (SRS MOD-08). Rejection refunds the wallet.
    let debit: { balanceAfter: number; reference: string } | undefined;
    await prisma.$transaction(async (tx) => {
      debit = await debitWallet(tx, {
        userId,
        currency: input.currency,
        amount: input.amount,
        type: 'WITHDRAWAL',
        referenceType: 'payout',
        description: `Withdrawal to ${method.accountName ?? humanizeMethod(method.type)}`,
      });
      await tx.payoutRequest.create({
        data: {
          userId,
          walletId: wallet.id,
          payoutMethodId: method.id,
          amount: round2(input.amount),
          feeAmount: fee,
          currency: input.currency,
          status: 'INITIATED',
          isExpress: !!input.express,
        },
      });
    });
    if (debit) {
      void NotificationService.notifyWalletEvent({
        userId,
        kind: 'withdrawal',
        amount: input.amount,
        currency: input.currency,
        reference: debit.reference,
        balanceAfter: debit.balanceAfter,
        fee: fee || undefined,
        method: method.accountName ?? humanizeMethod(method.type),
      });
      // Queue for operator review - payouts require manual approval (SRS MOD-08).
      void emitAdminEvent({
        type: 'PAYOUT_PENDING',
        severity: 'INFO',
        title: 'Payout awaiting approval',
        body: `A ${input.express ? 'express ' : ''}withdrawal of ${round2(input.amount)} ${input.currency} to ${
          method.accountName ?? method.type
        } is pending approval.`,
        permission: 'payouts.view',
        entityType: 'PayoutRequest',
        entityId: debit.reference,
        link: '/wallets',
        actorId: userId,
      });
    }
    return this.overview(userId);
  },

  /** Convert between two wallet currencies at mid-market + margin (FR-PAY-009). */
  async convert(userId: string, input: ConvertInput) {
    await assertCanTransact(userId, 'send');
    if (input.fromCurrency === input.toCurrency) {
      throw new AppError(400, 'Q-400', 'Choose two different currencies.');
    }
    // Converting OUT of a disabled currency is allowed (users can move funds),
    // but you can't convert INTO one that is turned off.
    if (!isCurrencyEnabled(input.toCurrency)) {
      throw new AppError(400, 'Q-400', 'That currency is not available on BiZik right now.');
    }
    const quote = fxQuote(input.fromCurrency, input.toCurrency, input.amount);
    const { midMarketRate: midRate, marginPct: margin, appliedRate, toAmount } = quote;

    await prisma.$transaction(async (tx) => {
      await debitWallet(tx, {
        userId,
        currency: input.fromCurrency,
        amount: input.amount,
        type: 'FX_OUT',
        referenceType: 'fx',
        description: `Convert to ${input.toCurrency}`,
      });
      await creditWallet(tx, {
        userId,
        currency: input.toCurrency,
        amount: toAmount,
        type: 'FX_IN',
        referenceType: 'fx',
        description: `Convert from ${input.fromCurrency}`,
      });
      await tx.fxConversion.create({
        data: {
          userId,
          fromCurrency: input.fromCurrency,
          toCurrency: input.toCurrency,
          fromAmount: round2(input.amount),
          toAmount,
          midMarketRate: midRate,
          marginPct: margin * 100,
          appliedRate,
        },
      });
    });
    return { ...(await this.overview(userId)), converted: { toAmount, appliedRate, midRate } };
  },
};

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
