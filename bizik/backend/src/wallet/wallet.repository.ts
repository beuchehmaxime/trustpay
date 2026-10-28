import { MilestoneStatus, Prisma } from '@prisma/client';

import { prisma } from '../lib/prisma';

const HELD: MilestoneStatus[] = ['FUNDED', 'ACTIVE', 'SUBMITTED', 'APPROVED', 'DISPUTED'];

export const WalletRepository = {
  getWallets(userId: string) {
    return prisma.wallet.findMany({
      where: { userId },
      orderBy: { balance: 'desc' },
    });
  },

  getPayoutMethods(userId: string) {
    return prisma.payoutMethod.findMany({
      where: { userId, deletedAt: null },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  },

  /** Only active (non-deleted) methods are usable for payouts/defaults. */
  findPayoutMethod(id: string) {
    return prisma.payoutMethod.findFirst({ where: { id, deletedAt: null } });
  },

  countPayoutMethods(userId: string) {
    return prisma.payoutMethod.count({ where: { userId, deletedAt: null } });
  },

  createPayoutMethod(data: Prisma.PayoutMethodUncheckedCreateInput) {
    return prisma.payoutMethod.create({ data });
  },

  /**
   * Remove a method. If it has NO payout history we can hard-delete; once it has
   * been used, we soft-delete so the PayoutRequest records (and audit trail) stay
   * intact instead of hitting the FK constraint.
   */
  async deletePayoutMethod(id: string) {
    const payoutCount = await prisma.payoutRequest.count({ where: { payoutMethodId: id } });
    if (payoutCount === 0) {
      await prisma.payoutMethod.delete({ where: { id } });
      return;
    }
    await prisma.payoutMethod.update({
      where: { id },
      data: { deletedAt: new Date(), isDefault: false },
    });
  },

  /** Make one method the default, clearing the flag on the user's others. */
  setDefaultPayoutMethod(userId: string, id: string) {
    return prisma.$transaction([
      prisma.payoutMethod.updateMany({ where: { userId }, data: { isDefault: false } }),
      prisma.payoutMethod.update({ where: { id }, data: { isDefault: true } }),
    ]);
  },

  promoteAnyDefault(userId: string) {
    return prisma.payoutMethod.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  },

  getTransactions(userId: string, take = 50) {
    return prisma.walletTransaction.findMany({
      where: { wallet: { userId } },
      orderBy: { createdAt: 'desc' },
      take,
    });
  },

  /** Milestones whose funds are currently held in escrow for this user. */
  /**
   * Milestones whose funds the user has locked in escrow - i.e. where the user
   * is the PAYER of the contract. Money held in escrow belongs to the payer
   * until it is released; a payee only owns it once it lands in their wallet, so
   * counting payee-side escrow here would overstate their portfolio.
   */
  getHeldMilestones(userId: string) {
    return prisma.milestone.findMany({
      where: {
        status: { in: HELD },
        contract: {
          OR: [
            { creatorIsPayer: true, creatorId: userId },
            { creatorIsPayer: false, counterpartyId: userId },
          ],
        },
      },
      select: { amount: true, currency: true },
    });
  },
};
