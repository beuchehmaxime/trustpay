import { accountBlockedReason, canAccountAct } from './account-status';
import { AppError } from './errors';
import { prisma } from './prisma';
import { systemSettings } from './system-settings';

/**
 * Where identity verification is required, and where it deliberately is not.
 *
 * BiZik gates the points where value LEAVES a user's control - sending money
 * and withdrawing it - plus creating a deal, which puts someone else's money at
 * stake. It does NOT gate receiving: money already sent must always be able to
 * land, and an unverified recipient with a balance has every reason to finish
 * verifying. Gating receipt would strand funds and punish the wrong person.
 *
 * One module so the rule cannot drift between the rails that enforce it.
 */

/** Actions that require a verified identity, with copy for each. */
export type GatedAction = 'send' | 'withdraw' | 'deal';

const REASON: Record<GatedAction, string> = {
  send: 'Verify your account before sending money. Your identity check keeps everyone on BiZik safe - you can still receive money in the meantime.',
  withdraw:
    'Verify your account before withdrawing. We have to know who is taking money out - you can still receive money and hold it in your wallet in the meantime.',
  deal: 'Verify your account (complete KYC) before creating a deal.',
};

/** Is this tier at or above the platform's "verified" bar? */
export function isVerifiedTier(kycTier: number): boolean {
  return kycTier >= systemSettings().verification.standardTier;
}

/**
 * What each tier means, and what earns it.
 *
 *   0  Unverified  a signup and nothing proven
 *   1  Basic       the phone number is proven - a real, reachable person
 *   2  Verified    identity documents checked and approved; the bar for
 *                  sending, withdrawing and creating a deal
 *   3  Enhanced    reserved for raised limits; nothing awards it yet
 *
 * The labels live in `kyc.service.ts` and the "verified" bar is configurable
 * (`verification.standardTier`), so neither number is written literally anywhere
 * that decides something.
 */
export const BASIC_TIER = 1;

/**
 * The new tier for someone who has just earned one, never lower than the tier
 * they already hold.
 *
 * Every path that awards a tier goes through this, because they are all
 * "achieved X, therefore at least tier N" - and written as a plain assignment,
 * any of them would DEMOTE someone who had already gone further. Re-verifying a
 * phone number after passing KYC would drop a customer from Verified back to
 * Basic and lock them out of their own money, which is the kind of bug that
 * looks like fraud to the person it happens to.
 */
export function tierAfterEarning(currentTier: number, earnedTier: number): number {
  return Math.max(currentTier, earnedTier);
}

/**
 * Throw unless this user is verified. Used by every path that moves money OUT
 * of an account, whichever channel or rail initiated it.
 */
export async function assertVerified(userId: string, action: GatedAction): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycTier: true },
  });
  if (!user) throw new AppError(404, 'Q-404', 'Account not found');
  if (!isVerifiedTier(user.kycTier)) {
    throw new AppError(403, 'Q-422-KYC', REASON[action]);
  }
}

/**
 * Throw unless this account is allowed to move money right now: it must be
 * verified for the action AND not suspended, frozen or closed.
 *
 * The status half matters as much as the KYC half. An AML freeze exists to stop
 * funds leaving while a case is open, so every outbound rail - withdrawals,
 * transfers, conversions, funding a deal - has to consult it. Checking it in
 * one helper is what stops a freeze from being enforced on some rails only.
 */
export async function assertCanTransact(userId: string, action: GatedAction): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { kycTier: true, status: true },
  });
  if (!user) throw new AppError(404, 'Q-404', 'Account not found');
  const blocked = accountBlockedReason(user.status);
  if (blocked || !canAccountAct(user.status)) {
    throw new AppError(403, 'Q-403-ACCOUNT', blocked ?? 'This account cannot transact right now.');
  }
  if (!isVerifiedTier(user.kycTier)) {
    throw new AppError(403, 'Q-422-KYC', REASON[action]);
  }
}
