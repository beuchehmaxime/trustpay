import { prisma } from '../lib/prisma';

/** Data sources for the weekly user digest. */
export const DigestRepository = {
  /** Active accounts with an email - candidates for the weekly digest. */
  candidateUsers() {
    return prisma.user.findMany({
      where: { status: 'ACTIVE', email: { not: null } },
      select: { id: true, email: true, fullName: true, country: true, createdAt: true },
    });
  },

  /** Every project the user is a party to (creator / counterparty / invitee). */
  contractsForUser(userId: string, email: string) {
    return prisma.contract.findMany({
      where: {
        OR: [
          { creatorId: userId },
          { counterpartyId: userId },
          { counterpartyEmail: email.toLowerCase() },
        ],
      },
      select: { id: true, status: true },
    });
  },

  /** Count of wallet movements across all the user's currency wallets. */
  walletTxCount(userId: string) {
    return prisma.walletTransaction.count({ where: { wallet: { userId } } });
  },

  /** Escrow balances for the user's projects, to total the value protected. */
  escrowAccountsForContracts(contractIds: string[]) {
    if (contractIds.length === 0) return Promise.resolve([]);
    return prisma.escrowAccount.findMany({
      where: { contractId: { in: contractIds } },
      select: { heldAmount: true, releasedAmount: true, refundedAmount: true, currency: true },
    });
  },
};
