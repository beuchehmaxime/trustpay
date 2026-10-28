import crypto from 'crypto';

import { Currency, PaymentTransaction, PayoutMethodType } from '@prisma/client';

import { config } from '../../config/env';
import { emitAdminEvent } from '../../lib/admin-events';
import { hasOpenComplianceCase, screenUserNow } from '../../aml/transaction-monitor';
import { decryptField } from '../../lib/crypto';
import { humanizeMethod } from '../../lib/method-format';
import { AppError } from '../../lib/errors';
import { assertCanTransact, assertVerified } from '../../lib/kyc-gate';
import { creditWallet, debitWallet } from '../../lib/ledger';
import { feeVariance, quoteProviderFee } from '../../lib/provider-fees';
import { prisma } from '../../lib/prisma';
import { usdRateOf } from '../../lib/settings';
import { payoutSettings } from '../../lib/system-settings';
import { NotificationService } from '../../notification/notification.service';
import { PaymentProviderName } from '../domain/payment.types';
import { asProviderRequestError } from '../domain/provider-error';
import { PaymentProviderFactory } from './payment-provider.factory';
import { PaymentRepository } from '../persistence/payment.repository';

/**
 * A payment source is either a saved (OTP-verified) payout method - from which
 * we resolve the provider + phone server-side - or a raw provider + phone.
 */
export interface PaymentSourceInput {
  userId: string;
  amount: number;
  currency: Currency;
  payoutMethodId?: string;
  provider?: PaymentProviderName;
  phoneNumber?: string;
}

/** What a deposit is being collected for, when it isn't a plain top-up. */
export type DepositPurpose = 'FUND_MILESTONE';

export type CreateDepositInput = PaymentSourceInput & {
  purpose?: DepositPurpose;
  purposeRefId?: string;
};
export type CreateWithdrawalInput = PaymentSourceInput;

/** Map a saved payout-method type onto a BiZik payment provider. */
function providerFromPayoutType(type: PayoutMethodType): PaymentProviderName {
  switch (type) {
    case 'MTN_MOMO':
      return 'MTN_MOBILE_MONEY';
    case 'ORANGE_MONEY':
      return 'ORANGE_MONEY';
    case 'BANK':
    case 'PAYONEER':
      return 'BANK';
    default:
      return 'BANK';
  }
}

/** Payout-method types whose destination number is proven by SMS-OTP. */
const OTP_VERIFIED_PAYOUT_TYPES = new Set<PayoutMethodType>(['MTN_MOMO', 'ORANGE_MONEY']);

/**
 * Resolve the provider + destination number from a saved method or raw input.
 *
 * For WITHDRAWALS (`forWithdrawal`) the destination MUST be a saved payout
 * method the user owns, and mobile-money numbers MUST be OTP-verified - money
 * can only leave a wallet to a proven destination. This closes the takeover /
 * mule vector where a raw, unverified number could be supplied to drain funds.
 * Deposits may still use a raw provider+phone (the customer is charged, not paid).
 */
async function resolveSource(
  input: PaymentSourceInput,
  opts: { forWithdrawal?: boolean } = {},
): Promise<{ provider: PaymentProviderName; phoneNumber: string }> {
  if (input.payoutMethodId) {
    const method = await prisma.payoutMethod.findFirst({
      where: { id: input.payoutMethodId, userId: input.userId, deletedAt: null },
    });
    if (!method) throw new AppError(404, 'Q-404', 'Payment method not found.');
    if (opts.forWithdrawal && OTP_VERIFIED_PAYOUT_TYPES.has(method.type) && !method.verified) {
      throw new AppError(
        403,
        'Q-403',
        'This mobile money number is not verified. Verify it before withdrawing.',
      );
    }
    return {
      provider: providerFromPayoutType(method.type),
      phoneNumber: decryptField(method.accountDetail),
    };
  }
  if (opts.forWithdrawal) {
    throw new AppError(400, 'Q-400', 'Withdrawals require a saved, verified payout method.');
  }
  if (input.provider && input.phoneNumber) {
    return { provider: input.provider, phoneNumber: input.phoneNumber };
  }
  throw new AppError(400, 'Q-400', 'A payment method (or provider + phone number) is required.');
}

/**
 * Carry out whatever a deposit was collected FOR, once the money is really in
 * the wallet. Today that is "fund this milestone straight from my Mobile Money
 * number": the deposit lands, then escrow is funded from the balance it just
 * created. Deliberately best-effort - if the funding step fails (the milestone
 * was funded meanwhile, the deal was cancelled), the money simply stays in the
 * user's wallet rather than the deposit being rolled back.
 */
async function runDepositPurpose(paymentTransaction: PaymentTransaction): Promise<void> {
  if (paymentTransaction.purpose !== 'FUND_MILESTONE' || !paymentTransaction.purposeRefId) {
    // A plain top-up: close the loop on WhatsApp too, since that is where many
    // people start one. pushText honours the opt-out and the 24-hour window on
    // its own, so this is silently skipped when it can't be delivered.
    const { WhatsAppNotify } = await import('../../whatsapp/whatsapp-notify');
    void WhatsAppNotify.walletToppedUp(paymentTransaction.userId, {
      amount: `${Number(paymentTransaction.amount)} ${paymentTransaction.currency}`,
    });
    return;
  }
  try {
    // Imported lazily: escrow depends on the ledger this module also uses.
    const { EscrowService } = await import('../../escrow/escrow.service');
    await EscrowService.fundMilestone(paymentTransaction.userId, paymentTransaction.purposeRefId, {});
    console.log(
      `[payments] ${paymentTransaction.transactionReference} funded milestone ${paymentTransaction.purposeRefId}`,
    );
    // Close the loop in the channel they paid from.
    const [{ WhatsAppNotify }, milestone] = await Promise.all([
      import('../../whatsapp/whatsapp-notify'),
      prisma.milestone.findUnique({
        where: { id: paymentTransaction.purposeRefId },
        select: { contract: { select: { title: true } } },
      }),
    ]);
    void WhatsAppNotify.escrowFunded(paymentTransaction.userId, {
      dealTitle: milestone?.contract.title ?? 'your deal',
      amount: `${Number(paymentTransaction.amount)} ${paymentTransaction.currency}`,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown error';
    console.error(
      `[payments] ${paymentTransaction.transactionReference} deposit landed but funding the milestone failed - ${reason}. The money is in the user's wallet.`,
    );
    const { NotificationRepository } = await import('../../notification/notification.repository');
    await NotificationRepository.create({
      userId: paymentTransaction.userId,
      category: 'PAYMENT',
      title: 'Your payment arrived, but the deal was not funded',
      body: `We received ${Number(paymentTransaction.amount)} ${paymentTransaction.currency}, but could not put it into escrow: ${reason} The money is safe in your BiZik wallet.`,
      channels: ['IN_APP', 'EMAIL'],
      deliveries: { create: [{ channel: 'IN_APP', status: 'DELIVERED' }] },
    }).catch(() => undefined);
  }
}

/** Mobile-money providers settle instantly; bank transfers don't run this path. */
function isMobileMoneyProvider(provider: PaymentProviderName): boolean {
  return provider === 'MTN_MOBILE_MONEY' || provider === 'ORANGE_MONEY';
}

/**
 * The currency each rail actually settles in. Fapshi (MTN + Orange, Cameroon)
 * pays and collects in XAF only, and its API carries no currency field, so the
 * number we send IS XAF whatever our transaction says.
 *
 * That made the wallet currency dangerous rather than cosmetic: a wallet
 * debited 1,000,000 NGN instructed a 1,000,000 XAF payout, about 2.5x the value
 * debited, and the XAF-equivalent approval gate did not catch it either. Any
 * request whose currency the rail cannot settle is now refused before funds are
 * reserved, instead of being silently paid out in the wrong unit.
 */
const RAIL_SETTLEMENT_CURRENCY: Partial<Record<PaymentProviderName, Currency>> = {
  MTN_MOBILE_MONEY: 'XAF',
  ORANGE_MONEY: 'XAF',
};

/**
 * Refuse anything the rail cannot carry faithfully: a currency it does not
 * settle in, a fractional amount in a currency with no minor unit (the adapter
 * rounds, and rounding up pays out more than was debited), or a destination
 * with no live rail at all.
 */
function assertRailCanSettle(
  provider: PaymentProviderName,
  amount: number,
  currency: Currency,
  operation: 'deposit' | 'withdrawal',
): void {
  const settlementCurrency = RAIL_SETTLEMENT_CURRENCY[provider];
  if (!settlementCurrency) {
    // BANK / PAYONEER have no live rail: the factory falls back to the
    // simulator, which reports success while no money moves.
    if (config.payments.mode === 'live') {
      throw new AppError(
        400,
        'Q-400',
        operation === 'withdrawal'
          ? 'Withdrawals to a bank or Payoneer are not available yet. Withdraw to MTN Mobile Money or Orange Money.'
          : 'Bank payments are not available yet. Pay with MTN Mobile Money or Orange Money.',
      );
    }
    return;
  }
  if (currency !== settlementCurrency) {
    throw new AppError(
      400,
      'Q-400',
      operation === 'withdrawal'
        ? `Mobile money pays out in ${settlementCurrency}. Convert your ${currency} balance to ${settlementCurrency} first.`
        : `Mobile money is collected in ${settlementCurrency}, so this ${currency} payment cannot be taken. Use a ${settlementCurrency} amount.`,
    );
  }
  if (!Number.isInteger(amount)) {
    throw new AppError(400, 'Q-400', `${settlementCurrency} amounts must be whole numbers.`);
  }
}

/** Convert an amount to its XAF (CEMAC franc) equivalent for threshold checks. */
function xafEquivalent(amount: number, currency: Currency): number {
  if (currency === 'XAF') return amount;
  return (amount * usdRateOf(currency)) / usdRateOf('XAF');
}

/**
 * A CEMAC (XAF) mobile-money withdrawal above the configured limit must be
 * manually approved before it's disbursed; everything else settles instantly.
 */
function requiresWithdrawalApproval(
  provider: PaymentProviderName,
  amount: number,
  currency: Currency,
): boolean {
  // Operator-configurable (Settings → Providers), falling back to the env
  // default. Withdrawals under the line are paid straight away; only the big
  // ones wait for a person.
  const { approvalThresholdXaf, automaticPayouts } = payoutSettings();
  if (!automaticPayouts) return true; // kill switch: review everything
  if (approvalThresholdXaf <= 0) return false; // no review at all
  if (!isMobileMoneyProvider(provider)) return false;
  // Compare the XAF-equivalent for ANY currency - Fapshi disburses in local XAF,
  // so a large payout labelled in another currency must not skip the gate.
  return xafEquivalent(amount, currency) > approvalThresholdXaf;
}

/**
 * Provider-agnostic money orchestration. Depends only on the capability
 * interfaces (via the factory) and the wallet ledger - never on MTN/Orange.
 *
 * Golden rules enforced here:
 *  - A deposit credits the wallet ONLY on a confirmed SUCCESSFUL result, never
 *    on the provider's initial "accepted" (PROCESSING).
 *  - A withdrawal RESERVES funds (debits the wallet) up front, and releases them
 *    (credits back) if the disbursement ultimately fails.
 *  - Wallet move + PaymentTransaction status change happen in ONE DB transaction.
 *  - Completion is idempotent, so replayed webhooks/reconciliation never double-
 *    credit or double-refund.
 */
/**
 * Compare a provider's confirmation with our own record before money moves.
 * Returns a human-readable reason to refuse, or null when they agree. Fields
 * the provider does not report are not treated as mismatches.
 */
function describeSettlementMismatch(
  paymentTransaction: PaymentTransaction,
  result: { amount?: number; transactionReference?: string },
): string | null {
  if (
    result.transactionReference &&
    result.transactionReference !== paymentTransaction.transactionReference
  ) {
    return `provider reports reference ${result.transactionReference}, ours is ${paymentTransaction.transactionReference}`;
  }
  if (typeof result.amount === 'number') {
    // What the PROVIDER moved, which is the wallet amount plus the rail's cut
    // charged on top of it - not the wallet amount alone. Comparing against
    // `amount` here would make every deposit look short by exactly the fee and
    // refuse to settle it, which is the opposite of what this guard is for.
    const expected = Number(paymentTransaction.amount) + Number(paymentTransaction.providerFee ?? 0);
    // Allow a sub-unit rounding difference only.
    if (Math.abs(result.amount - expected) > 0.5) {
      return `provider reports ${result.amount}, we expected ${expected} ${paymentTransaction.currency}`;
    }
  }
  return null;
}

/**
 * Say so when the rail charged materially more than we estimated.
 *
 * The configured rate is a guess corrected by evidence, and the evidence only
 * arrives here. One franc either way is rounding; a consistent gap means every
 * transaction is quietly losing money, and the whole point of recording both
 * figures is that somebody finds out from a log rather than from a dashboard
 * that stopped adding up.
 *
 * Never throws and never blocks settlement: the money has already moved, and
 * refusing to record it because the fee was surprising would be worse.
 */
function reportFeeVariance(paymentTransaction: PaymentTransaction, actualFee?: number): void {
  if (actualFee === undefined) return;
  const estimated = Number(paymentTransaction.providerFee ?? 0);
  const variance = feeVariance(estimated, actualFee);
  if (Math.abs(variance) <= 1) return; // rounding, not drift
  console.warn(
    `[payments] provider fee variance on ${paymentTransaction.transactionReference}:` +
      ` charged ${estimated}, rail took ${actualFee} (${variance > 0 ? '+' : ''}${variance} ${paymentTransaction.currency}).` +
      ' If this repeats, correct providers.providerFees in settings.',
  );
}

/**
 * Does this refusal mean OUR payout account is empty, rather than anything
 * wrong with the user's request?
 *
 * Matched on the message because that is all the provider gives: Fapshi answers
 * a payout from an unfunded service with HTTP 400 "Insufficient funds", which is
 * indistinguishable by status code from a malformed request. Matched loosely and
 * conservatively - a wording change degrades to the ordinary refusal path, which
 * refunds the user rather than holding their money.
 */
function isInsufficientProviderFloat(reason: string): boolean {
  const text = reason.toLowerCase();
  return (
    text.includes('insufficient fund') ||
    text.includes('insufficient balance') ||
    text.includes('not enough fund')
  );
}

export const PaymentService = {
  // ---- Deposit (collection) ----

  async createDeposit(input: CreateDepositInput): Promise<PaymentTransaction> {
    const { provider, phoneNumber } = await resolveSource(input);
    assertRailCanSettle(provider, input.amount, input.currency, 'deposit');

    // The rail's cut rides ON TOP: the customer is prompted for amount + fee,
    // and exactly `amount` reaches their wallet. Charging the fee out of the
    // deposit instead would mean asking for 250 and receiving 242, which is the
    // behaviour this replaces.
    const quote = quoteProviderFee(input.amount, 'deposit', provider, input.currency);

    const transactionReference = `DEP-${crypto.randomUUID()}`;
    const pending = await PaymentRepository.createPending({
      userId: input.userId,
      transactionReference,
      provider,
      operation: 'DEPOSIT',
      amount: input.amount,
      providerFee: quote.fee,
      currency: input.currency,
      phoneNumber,
      purpose: input.purpose,
      purposeRefId: input.purposeRefId,
    });

    const collectionProvider = PaymentProviderFactory.getCollectionProvider(provider);

    let providerReference: string;
    let providerStatus: string;
    try {
      const response = await collectionProvider.initiateCollection({
        transactionReference,
        // The provider collects the TOTAL. `amount` stays the wallet figure, so
        // everything downstream keeps crediting what the user asked for.
        amount: String(quote.total),
        currency: input.currency,
        customerPhoneNumber: phoneNumber,
        description:
          input.purpose === 'FUND_MILESTONE' ? 'BiZik escrow funding' : 'BiZik wallet deposit',
      });
      providerReference = response.providerReference;
      providerStatus = response.status;
    } catch (providerError) {
      const failure = asProviderRequestError(providerError);
      const reason = failure.message;

      if (failure.delivery === 'unknown') {
        // The collection may already have debited the payer's mobile money. If
        // we mark this FAILED the payer is out of pocket with nothing on BiZik
        // to show for it, so it stays open for reconciliation instead.
        const unconfirmed = await PaymentRepository.markUnconfirmed(pending.id, reason.slice(0, 500));
        console.error(
          `[payments] DEPOSIT ${transactionReference} provider=${provider} OUTCOME UNKNOWN - ${reason}` +
            ' | may have been collected - needs reconciliation',
        );
        void emitAdminEvent({
          type: 'SYSTEM',
          severity: 'WARNING',
          title: 'Deposit outcome unknown',
          body:
            `${transactionReference} (${input.amount} ${input.currency}, ${humanizeMethod(provider)}) got no answer` +
            ` from the provider: ${reason}. The payer may have been debited without being credited.` +
            ' Check the provider dashboard before telling them to pay again.',
          permission: 'payouts.manage',
          entityType: 'PaymentTransaction',
          entityId: pending.id,
          link: '/wallets',
        });
        // Same reasoning as the withdrawal: report it as pending, not failed, so
        // the payer waits for the real outcome instead of paying a second time.
        return unconfirmed;
      }

      console.error(`[payments] DEPOSIT ${transactionReference} provider=${provider} REJECTED - ${reason}`);
      await PaymentRepository.markFailed(pending.id, reason.slice(0, 500));
      // A 4xx from the provider means the rail itself is unavailable to us
      // (not activated, credentials rejected) - retrying achieves nothing, so
      // point the payer at what CAN work instead of "please try again".
      const railUnavailable = /\((40[13])\)|forbidden|unauthori[sz]ed|not activated/i.test(reason);
      throw new AppError(
        402,
        'Q-402',
        railUnavailable
          ? 'Mobile Money payments are temporarily unavailable on BiZik. You can fund from your BiZik wallet balance instead - we are on it.'
          : 'Could not start the payment. Please check the number and try again.',
      );
    }

    const processing = await PaymentRepository.markProcessing(pending.id, providerReference, undefined);
    console.log(
      `[payments] DEPOSIT ${transactionReference} provider=${provider} status=${providerStatus} (${providerStatus === 'PROCESSING' ? 'real provider - awaiting confirmation' : 'settled synchronously'})`,
    );

    // The simulator resolves synchronously → complete now (matches today's UX).
    // A real provider returns PROCESSING → the webhook/reconciler completes later.
    if (providerStatus === 'SUCCESSFUL') {
      return this.completeDeposit(processing.id, {});
    }
    if (providerStatus === 'FAILED') {
      return PaymentRepository.markFailed(processing.id, 'Payment was declined');
    }
    return processing;
  },

  /**
   * Idempotently credit the wallet for a confirmed deposit. Concurrency-safe:
   * the PENDING/PROCESSING → SUCCESSFUL transition is an ATOMIC conditional
   * update performed inside the same DB transaction as the wallet credit. Only
   * the single caller that actually flips the row credits the wallet, so a
   * webhook + reconciler + client-poll racing on the same transaction can never
   * double-credit (the losers see `count === 0` and no-op).
   */
  async completeDeposit(
    paymentTransactionId: string,
    fields: { providerTransactionId?: string; providerFee?: number },
  ): Promise<PaymentTransaction> {
    const paymentTransaction = await PaymentRepository.findById(paymentTransactionId);
    if (!paymentTransaction) throw new AppError(404, 'Q-404', 'Payment transaction not found');
    if (paymentTransaction.operation !== 'DEPOSIT') {
      throw new AppError(409, 'Q-409', 'Transaction is not a deposit');
    }
    if (paymentTransaction.status === 'SUCCESSFUL') return paymentTransaction; // fast-path

    const balanceAfter = await prisma.$transaction(async (dbTx) => {
      const claim = await dbTx.paymentTransaction.updateMany({
        where: { id: paymentTransaction.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: {
          status: 'SUCCESSFUL',
          providerTransactionId: fields.providerTransactionId,
          // What the rail actually kept, which is only knowable now. Stored
          // beside the estimate we charged so the two can be compared.
          ...(fields.providerFee !== undefined ? { providerFeeActual: fields.providerFee } : {}),
          completedAt: new Date(),
        },
      });
      if (claim.count === 0) return null; // another caller already settled it
      const credit = await creditWallet(dbTx, {
        userId: paymentTransaction.userId,
        currency: paymentTransaction.currency,
        amount: Number(paymentTransaction.amount),
        type: 'DEPOSIT',
        referenceType: 'topup',
        referenceId: paymentTransaction.transactionReference,
        description: `Wallet deposit · ${humanizeMethod(paymentTransaction.provider)}`,
      });
      await dbTx.paymentTransaction.update({
        where: { id: paymentTransaction.id },
        data: { walletReference: credit.reference },
      });
      return credit.balanceAfter;
    });

    const updated = (await PaymentRepository.findById(paymentTransaction.id))!;
    if (balanceAfter === null) return updated; // idempotent no-op

    void NotificationService.notifyWalletEvent({
      userId: paymentTransaction.userId,
      kind: 'deposit',
      amount: Number(paymentTransaction.amount),
      currency: paymentTransaction.currency,
      reference: updated.walletReference ?? updated.transactionReference,
      balanceAfter,
    });
    // The money is in the wallet - now do what it was collected for.
    await runDepositPurpose(updated);
    return updated;
  },

  // ---- Withdrawal (disbursement) ----

  async createWithdrawal(input: CreateWithdrawalInput): Promise<PaymentTransaction> {
    // Money leaving the platform always requires a verified identity - checked
    // here too, so no rail can bypass it by calling the provider layer direct.
    await assertCanTransact(input.userId, 'withdraw');
    const { provider, phoneNumber } = await resolveSource(input, { forWithdrawal: true });
    // Refuse a currency or destination the rail cannot actually settle, before
    // a single franc is reserved.
    assertRailCanSettle(provider, input.amount, input.currency, 'withdrawal');

    // The rail's cut rides ON TOP of the debit: the wallet gives up
    // amount + fee, and exactly `amount` lands on the user's phone. Taking the
    // fee out of the payout instead would mean asking for 100 and receiving 97.
    const quote = quoteProviderFee(input.amount, 'withdrawal', provider, input.currency);

    const transactionReference = `WD-${crypto.randomUUID()}`;
    const pending = await PaymentRepository.createPending({
      userId: input.userId,
      transactionReference,
      provider,
      operation: 'WITHDRAWAL',
      amount: input.amount,
      providerFee: quote.fee,
      currency: input.currency,
      phoneNumber,
    });

    // Reserve the funds now (atomic debit + record the ledger ref on the txn).
    try {
      await prisma.$transaction(async (dbTx) => {
        const debit = await debitWallet(dbTx, {
          userId: input.userId,
          currency: input.currency,
          // The TOTAL leaves the wallet, so the balance check below covers the
          // fee too - reserving only the payout amount would let someone
          // withdraw their whole balance and leave the fee uncovered.
          amount: quote.total,
          type: 'WITHDRAWAL',
          referenceType: 'payout',
          referenceId: transactionReference,
          description:
            quote.fee > 0
              ? `Wallet withdrawal · ${humanizeMethod(provider)} (incl. ${quote.fee} ${input.currency} transfer fee)`
              : `Wallet withdrawal · ${humanizeMethod(provider)}`,
        });
        await dbTx.paymentTransaction.update({
          where: { id: pending.id },
          data: { walletReference: debit.reference },
        });
      });
    } catch (error) {
      await PaymentRepository.markFailed(pending.id, 'Insufficient wallet balance');
      if (error instanceof AppError) throw error;
      throw new AppError(400, 'Q-400', 'Insufficient wallet balance.');
    }

    // No automatic rail (Fapshi payouts not yet enabled for this account, or no
    // bank rail): the user's request is accepted and the funds stay reserved,
    // but an operator has to pay it out and confirm. Queued in the same place
    // as large withdrawals so there is one queue to work.
    if (!PaymentProviderFactory.canDisburse(provider)) {
      const queued = await PaymentRepository.markHeldForApproval(pending.id);
      console.log(
        `[payments] WITHDRAWAL ${transactionReference} queued for MANUAL payout` +
          ` (no automatic ${provider} rail configured)`,
      );
      void emitAdminEvent({
        type: 'PAYOUT_PENDING',
        severity: 'WARNING',
        title: 'Withdrawal needs a manual payout',
        body:
          `${transactionReference} (${input.amount} ${input.currency}, ${humanizeMethod(provider)}) is waiting.` +
          ' Send the money, then mark it paid in the payout queue.',
        permission: 'payouts.manage',
        entityType: 'PaymentTransaction',
        entityId: pending.id,
        link: '/wallets',
      });
      return queued;
    }

    // ---- Compliance interdiction, before the money leaves ----
    // Screening after the fact documents a loss; holding the payout until a
    // person has looked prevents one. This runs the monitoring rules against
    // this account's recent history right now, because the periodic sweep
    // leaves a window - a pattern completed two minutes ago has not been swept
    // yet, and the withdrawal that completes it would otherwise settle first.
    //
    // It holds the TRANSACTION, not the account: the balance and the login are
    // untouched, and clearing the case releases the payout.
    const complianceHold = await (async () => {
      try {
        const [findings, openCase] = await Promise.all([
          screenUserNow(input.userId),
          hasOpenComplianceCase(input.userId),
        ]);
        return findings.length > 0 || openCase;
      } catch (error) {
        // A screening failure must not strand a legitimate withdrawal, and must
        // not silently wave one through either. Let it proceed to the ordinary
        // threshold check and say loudly that the control did not run.
        console.error('[aml] pre-withdrawal screening failed:', (error as Error).message);
        return false;
      }
    })();

    if (complianceHold) {
      const held = await PaymentRepository.markHeldForApproval(pending.id);
      console.warn(
        `[aml] WITHDRAWAL ${transactionReference} held - open or newly raised compliance case`,
      );
      return held;
    }

    // Large CEMAC mobile-money withdrawals are held for manual approval - funds
    // stay reserved, the provider is NOT called until an operator approves.
    if (requiresWithdrawalApproval(provider, input.amount, input.currency)) {
      const held = await PaymentRepository.markHeldForApproval(pending.id);
      console.log(
        `[payments] WITHDRAWAL ${transactionReference} held for approval` +
          ` (${input.amount} ${input.currency} > ${config.payments.withdrawalApprovalXaf} XAF)`,
      );
      return held;
    }

    const disbursementProvider = PaymentProviderFactory.getDisbursementProvider(provider);
    let providerReference: string;
    let providerStatus: string;
    try {
      const response = await disbursementProvider.initiateDisbursement({
        transactionReference,
        amount: String(input.amount),
        currency: input.currency,
        recipientPhoneNumber: phoneNumber,
        description: 'BiZik wallet withdrawal',
        provider,
      });
      providerReference = response.providerReference;
      providerStatus = response.status;
    } catch (providerError) {
      const failure = asProviderRequestError(providerError);
      const reason = failure.message;

      if (failure.delivery === 'unknown') {
        // We do NOT know whether the recipient was paid. Refunding here would
        // pay them twice - once on their mobile money, once back into the BiZik
        // wallet - and that money is gone. So the reservation STAYS debited and
        // the transaction stays non-terminal for reconciliation/an operator to
        // settle once the real outcome is known.
        const unconfirmed = await PaymentRepository.markUnconfirmed(pending.id, reason.slice(0, 500));
        console.error(
          `[payments] WITHDRAWAL ${transactionReference} provider=${provider} OUTCOME UNKNOWN - ${reason}` +
            ' | funds stay reserved, NOT refunded - needs reconciliation',
        );
        // Nothing can resolve this automatically: with no provider reference we
        // cannot ask the provider what happened, so a human has to check the
        // provider's dashboard and settle it.
        void emitAdminEvent({
          type: 'PAYOUT_PENDING',
          severity: 'CRITICAL',
          title: 'Withdrawal outcome unknown',
          body:
            `${transactionReference} (${input.amount} ${input.currency}, ${humanizeMethod(provider)}) got no answer` +
            ` from the provider: ${reason}. Funds are still reserved and were NOT refunded.` +
            ' Check the provider dashboard, then settle or reverse it.',
          permission: 'payouts.manage',
          entityType: 'PaymentTransaction',
          entityId: pending.id,
          link: '/wallets',
        });
        // Returned as a normal PROCESSING withdrawal, because that is exactly
        // what it is: the money is reserved and the outcome is still open. An
        // error here would invite the user to press send again, which is the one
        // thing that could pay the recipient twice.
        return unconfirmed;
      }

      // A float shortage on OUR disbursement account is not the user's fault
      // and not something they can fix by trying again. Fapshi keeps collection
      // and payout as separate services with separate balances and offers no
      // API to move money between them, so the payout side runs dry while
      // deposits pile up on the collection side. Failing here would tell
      // somebody with money in their wallet that their withdrawal was refused.
      //
      // So it is queued exactly like a withdrawal with no automatic rail: funds
      // stay reserved, an operator tops up the float and pays it, and the user
      // sees a withdrawal in progress - which is the truth.
      if (isInsufficientProviderFloat(reason)) {
        const queued = await PaymentRepository.markHeldForApproval(pending.id);
        console.error(
          `[payments] WITHDRAWAL ${transactionReference} queued - ${humanizeMethod(provider)} disbursement float is EMPTY` +
            ' | funds stay reserved, top up the payout service',
        );
        void emitAdminEvent({
          type: 'PAYOUT_PENDING',
          severity: 'CRITICAL',
          title: 'Payout float is empty',
          body:
            `${transactionReference} (${input.amount} ${input.currency}) could not be sent: the disbursement` +
            ' service has no balance. Deposits land on the COLLECTION service and do not move across on their own.' +
            ' Transfer funds to the payout service in the provider dashboard, then release this from the payout queue.',
          permission: 'payouts.manage',
          entityType: 'PaymentTransaction',
          entityId: pending.id,
          link: '/wallets',
        });
        return queued;
      }

      // The provider answered and refused for a reason of its own: nothing was
      // disbursed, so releasing the reservation is safe.
      console.error(`[payments] WITHDRAWAL ${transactionReference} provider=${provider} REJECTED - ${reason}`);
      await this.reverseWithdrawal(pending.id, reason.slice(0, 500));
      throw new AppError(402, 'Q-402', 'Could not start the withdrawal. Please try again.');
    }

    const processing = await PaymentRepository.markProcessing(pending.id, providerReference, undefined);

    if (providerStatus === 'SUCCESSFUL') {
      // Funds already left the wallet at reservation; just finalise.
      return this.completeWithdrawal(processing.id, { success: true });
    }
    if (providerStatus === 'FAILED') {
      return this.completeWithdrawal(processing.id, { success: false, failureReason: 'Disbursement declined' });
    }
    return processing;
  },

  /**
   * Idempotently finalise a withdrawal: keep the debit on success, refund it on
   * failure. Both branches use an ATOMIC status transition as the gate, so
   * concurrent settlement (webhook + reconciler + client poll) can neither
   * double-notify a success nor double-refund a failure.
   */
  async completeWithdrawal(
    paymentTransactionId: string,
    fields: { success: boolean; providerTransactionId?: string; failureReason?: string },
  ): Promise<PaymentTransaction> {
    const paymentTransaction = await PaymentRepository.findById(paymentTransactionId);
    if (!paymentTransaction) throw new AppError(404, 'Q-404', 'Payment transaction not found');
    if (paymentTransaction.operation !== 'WITHDRAWAL') {
      throw new AppError(409, 'Q-409', 'Transaction is not a withdrawal');
    }
    if (['SUCCESSFUL', 'FAILED', 'REVERSED'].includes(paymentTransaction.status)) {
      return paymentTransaction; // already terminal - idempotent
    }

    if (fields.success) {
      // Only the caller that flips PROCESSING → SUCCESSFUL proceeds (no money
      // moves here - funds already left the wallet at reservation).
      const claim = await prisma.paymentTransaction.updateMany({
        where: { id: paymentTransaction.id, status: { in: ['PENDING', 'PROCESSING'] } },
        data: {
          status: 'SUCCESSFUL',
          providerTransactionId: fields.providerTransactionId,
          completedAt: new Date(),
        },
      });
      const updated = (await PaymentRepository.findById(paymentTransaction.id))!;
      if (claim.count === 0) return updated; // another caller already settled it
      const wallet = await prisma.wallet.findUnique({
        where: { userId_currency: { userId: paymentTransaction.userId, currency: paymentTransaction.currency } },
      });
      void NotificationService.notifyWalletEvent({
        userId: paymentTransaction.userId,
        kind: 'withdrawal',
        amount: Number(paymentTransaction.amount),
        currency: paymentTransaction.currency,
        reference: paymentTransaction.walletReference ?? paymentTransaction.transactionReference,
        balanceAfter: wallet ? Number(wallet.balance) : 0,
        method: paymentTransaction.provider,
      });
      return updated;
    }

    await this.reverseWithdrawal(paymentTransaction.id, fields.failureReason ?? 'Withdrawal failed');
    return (await PaymentRepository.findById(paymentTransaction.id))!;
  },

  /**
   * Atomically reverse a not-yet-terminal withdrawal and refund the reserved
   * amount to the wallet EXACTLY ONCE. The PENDING/PROCESSING → REVERSED flip is
   * the idempotency gate: only the caller that wins the flip issues the refund,
   * so concurrent failure callbacks / rejects can't double-credit the wallet.
   */
  async reverseWithdrawal(paymentTransactionId: string, reason: string): Promise<boolean> {
    return prisma.$transaction(async (dbTx) => {
      const claim = await dbTx.paymentTransaction.updateMany({
        where: { id: paymentTransactionId, status: { in: ['PENDING', 'PROCESSING'] } },
        data: { status: 'REVERSED', failureReason: reason, completedAt: new Date() },
      });
      if (claim.count === 0) return false; // already terminal - nothing to refund
      const pt = await dbTx.paymentTransaction.findUnique({ where: { id: paymentTransactionId } });
      if (pt?.walletReference) {
        // Refund what was RESERVED, which is the payout plus the transfer fee
        // charged on top of it. Refunding `amount` alone would keep the fee for
        // a transfer that never happened - a small, silent, per-failure theft
        // from the user, and the kind that only shows up in a complaint.
        await creditWallet(dbTx, {
          userId: pt.userId,
          currency: pt.currency,
          amount: Number(pt.amount) + Number(pt.providerFee ?? 0),
          type: 'REFUND',
          referenceType: 'refund',
          referenceId: pt.transactionReference,
          description: `Withdrawal reversed · ${humanizeMethod(pt.provider)}`,
        });
      }
      return true;
    });
  },

  // ---- Manual approval of held withdrawals (CEMAC large-amount gate) ----

  /** Withdrawals awaiting a manual approval decision (admin queue). */
  async listHeldWithdrawals(): Promise<PaymentTransaction[]> {
    return PaymentRepository.findHeldWithdrawals();
  },

  /** Approve a held withdrawal → clear the hold and send it to the provider. */
  async approveWithdrawal(reviewerId: string, id: string): Promise<PaymentTransaction> {
    const paymentTransaction = await PaymentRepository.findById(id);
    if (!paymentTransaction) throw new AppError(404, 'Q-404', 'Payment transaction not found');
    if (
      paymentTransaction.operation !== 'WITHDRAWAL' ||
      !paymentTransaction.heldForApproval ||
      paymentTransaction.status !== 'PENDING'
    ) {
      throw new AppError(409, 'Q-409', 'This withdrawal is not awaiting approval.');
    }

    // Claim it first. The checks above ran on a row read OUTSIDE any lock, so
    // two reviewers (or the SLA expiry job) could otherwise both reach the
    // provider and pay the same withdrawal twice - these are the largest
    // payouts on the platform.
    const claimed = await PaymentRepository.claimApprovalHold(id, reviewerId);
    if (!claimed) {
      throw new AppError(409, 'Q-409', 'This withdrawal has already been decided.');
    }

    if (!PaymentProviderFactory.canDisburse(paymentTransaction.provider)) {
      // Put the claim back: the operator has to send the money themselves and
      // then record it, so "approve" here would be a lie.
      await PaymentRepository.markHeldForApproval(paymentTransaction.id);
      throw new AppError(
        400,
        'Q-400',
        'There is no automatic payout rail for this method. Send the money, then use "Mark as paid".',
      );
    }

    const disbursementProvider = PaymentProviderFactory.getDisbursementProvider(paymentTransaction.provider);
    let providerReference: string;
    let providerStatus: string;
    try {
      const response = await disbursementProvider.initiateDisbursement({
        transactionReference: paymentTransaction.transactionReference,
        amount: String(paymentTransaction.amount),
        currency: paymentTransaction.currency,
        recipientPhoneNumber: paymentTransaction.phoneNumber ?? '',
        description: 'BiZik wallet withdrawal (approved)',
        provider: paymentTransaction.provider,
      });
      providerReference = response.providerReference;
      providerStatus = response.status;
    } catch (providerError) {
      // Same rule as the unattended path: only reverse when the provider
      // actually refused. A timeout or 5xx may still have paid the recipient,
      // so the reservation stays debited and a human settles it.
      const failure = asProviderRequestError(providerError);
      if (failure.delivery === 'unknown') {
        const unconfirmed = await PaymentRepository.markUnconfirmed(
          paymentTransaction.id,
          failure.message.slice(0, 500),
        );
        console.error(
          `[payments] WITHDRAWAL ${paymentTransaction.transactionReference} approved but OUTCOME UNKNOWN` +
            ` - ${failure.message} | funds stay reserved, NOT refunded`,
        );
        void emitAdminEvent({
          type: 'PAYOUT_PENDING',
          severity: 'CRITICAL',
          title: 'Approved withdrawal outcome unknown',
          body:
            `${paymentTransaction.transactionReference} (${paymentTransaction.amount} ${paymentTransaction.currency})` +
            ` got no answer from the provider: ${failure.message}. Funds are still reserved and were NOT refunded.` +
            ' Check the provider dashboard, then settle or reverse it.',
          permission: 'payouts.manage',
          entityType: 'PaymentTransaction',
          entityId: paymentTransaction.id,
          link: '/wallets',
        });
        return unconfirmed;
      }
      await this.reverseWithdrawal(paymentTransaction.id, `Disbursement refused after approval: ${failure.message}`);
      return (await PaymentRepository.findById(paymentTransaction.id))!;
    }

    const processing = await PaymentRepository.markProcessing(paymentTransaction.id, providerReference, undefined);
    if (providerStatus === 'SUCCESSFUL') {
      return this.completeWithdrawal(processing.id, { success: true });
    }
    if (providerStatus === 'FAILED') {
      return this.completeWithdrawal(processing.id, { success: false, failureReason: 'Disbursement declined' });
    }
    return processing;
  },

  /**
   * Record a withdrawal an operator paid OUTSIDE the platform (from the Fapshi
   * dashboard, or mobile money directly). The funds were already reserved when
   * the user asked, so nothing moves here: the transaction is closed as paid
   * and the external reference is stored so it can be reconciled later.
   *
   * This is what keeps withdrawals working while Fapshi payouts are pending
   * activation, without ever claiming an automatic payout happened.
   */
  async settleWithdrawalManually(
    reviewerId: string,
    id: string,
    externalReference: string,
  ): Promise<PaymentTransaction> {
    const paymentTransaction = await PaymentRepository.findById(id);
    if (!paymentTransaction) throw new AppError(404, 'Q-404', 'Payment transaction not found');
    if (paymentTransaction.operation !== 'WITHDRAWAL') {
      throw new AppError(409, 'Q-409', 'That transaction is not a withdrawal.');
    }
    const claimed = await PaymentRepository.claimApprovalHold(id, reviewerId);
    if (!claimed) {
      throw new AppError(409, 'Q-409', 'This withdrawal has already been decided.');
    }
    console.log(
      `[payments] WITHDRAWAL ${paymentTransaction.transactionReference} settled MANUALLY by ${reviewerId}` +
        ` (ref ${externalReference})`,
    );
    return this.completeWithdrawal(paymentTransaction.id, {
      success: true,
      providerTransactionId: `manual:${externalReference}`,
    });
  },

  /** Reject a held withdrawal → refund the reservation and fail the transaction. */
  async rejectWithdrawal(reviewerId: string, id: string, reason?: string): Promise<PaymentTransaction> {
    const paymentTransaction = await PaymentRepository.findById(id);
    if (!paymentTransaction) throw new AppError(404, 'Q-404', 'Payment transaction not found');
    if (
      paymentTransaction.operation !== 'WITHDRAWAL' ||
      !paymentTransaction.heldForApproval ||
      paymentTransaction.status !== 'PENDING'
    ) {
      throw new AppError(409, 'Q-409', 'This withdrawal is not awaiting approval.');
    }

    // Claim it, so a reject racing an approve cannot both refund the wallet and
    // send the payout.
    const claimed = await PaymentRepository.claimApprovalHold(id, reviewerId);
    if (!claimed) {
      throw new AppError(409, 'Q-409', 'This withdrawal has already been decided.');
    }
    await this.reverseWithdrawal(paymentTransaction.id, reason ?? 'Withdrawal rejected by compliance');
    return (await PaymentRepository.findById(paymentTransaction.id))!;
  },

  /** Complete a transaction of either operation (used by webhook + reconciliation). */
  async applyOutcome(
    paymentTransaction: PaymentTransaction,
    outcome: {
      success: boolean;
      providerTransactionId?: string;
      failureReason?: string;
      /** What the rail actually kept, when the provider reports it. */
      providerFee?: number;
    },
  ): Promise<PaymentTransaction> {
    if (paymentTransaction.operation === 'DEPOSIT') {
      if (outcome.success) {
        reportFeeVariance(paymentTransaction, outcome.providerFee);
        return this.completeDeposit(paymentTransaction.id, {
          providerTransactionId: outcome.providerTransactionId,
          providerFee: outcome.providerFee,
        });
      }
      return PaymentRepository.markFailed(paymentTransaction.id, outcome.failureReason);
    }
    return this.completeWithdrawal(paymentTransaction.id, outcome);
  },

  /**
   * If a transaction is still PROCESSING, ask the provider for its live status
   * and settle it. Called by the reconciler AND on every client status fetch, so
   * the app's poll settles the payment promptly instead of waiting for the cron.
   */
  async pollAndSettle(paymentTransaction: PaymentTransaction): Promise<PaymentTransaction> {
    if (paymentTransaction.status !== 'PROCESSING' || !paymentTransaction.providerReference) {
      return paymentTransaction;
    }
    try {
      const statusProvider = PaymentProviderFactory.getStatusProvider(paymentTransaction.provider);
      const result = await statusProvider.getTransactionStatus(
        paymentTransaction.providerReference,
        paymentTransaction.operation,
      );
      if (result.status === 'SUCCESSFUL') {
        // Only settle what the provider confirms is OURS and is the FULL amount.
        // A mismatch means the provider's view and ours disagree, which must be
        // looked at by a person rather than credited.
        const mismatch = describeSettlementMismatch(paymentTransaction, result);
        if (mismatch) {
          console.error(
            `[payments] ${paymentTransaction.transactionReference} settlement REFUSED - ${mismatch}`,
          );
          void emitAdminEvent({
            type: 'PAYOUT_PENDING',
            severity: 'CRITICAL',
            title: 'Payment does not match the provider',
            body: `${paymentTransaction.transactionReference}: ${mismatch}. Nothing was credited or completed.`,
            permission: 'payouts.manage',
            entityType: 'PaymentTransaction',
            entityId: paymentTransaction.id,
            link: '/wallets',
          });
          return paymentTransaction;
        }
        return this.applyOutcome(paymentTransaction, {
          success: true,
          providerTransactionId: result.providerTransactionId,
          providerFee: result.providerFee,
        });
      }
      if (result.status === 'FAILED') {
        return this.applyOutcome(paymentTransaction, {
          success: false,
          failureReason: result.failureReason,
        });
      }
    } catch (error) {
      console.error('[payments] live poll failed:', (error as Error).message);
    }
    return paymentTransaction; // still processing
  },

  /** Fetch a user's transaction, settling it live if it's still processing. */
  async getTransactionForUser(userId: string, id: string): Promise<PaymentTransaction> {
    const paymentTransaction = await PaymentRepository.findById(id);
    if (!paymentTransaction || paymentTransaction.userId !== userId) {
      throw new AppError(404, 'Q-404', 'Payment transaction not found');
    }
    return this.pollAndSettle(paymentTransaction);
  },
};
