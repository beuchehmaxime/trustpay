import { Currency } from '@prisma/client';

import { fromUsd, homeCurrencyFor } from '../lib/domain';
import { usdRateOf } from '../lib/settings';
import { enqueueEmail } from '../lib/queue';
import { DigestRepository } from './digest.repository';

const ACTIVE_STATUSES = ['SIGNED', 'FUNDED', 'IN_PROGRESS', 'IN_REVIEW', 'DISPUTED'];

const toUsd = (amount: number, currency: Currency) => amount * usdRateOf(currency);

/** Display-ready digest stats for one user's weekly email. */
export interface DigestStats {
  firstName: string;
  projectsTotal: number;
  projectsCompleted: number;
  projectsActive: number;
  transactions: number;
  /** Total value that has flowed through escrow for the user, in their home currency. */
  protectedLabel: string;
  homeCurrency: Currency;
}

function moneyLabel(amount: number, currency: Currency): string {
  return `${Math.round(amount).toLocaleString('en-US')} ${currency}`;
}

export const DigestService = {
  /** Compute a user's project + transaction summary for the digest email. */
  async buildForUser(user: {
    id: string;
    email: string | null;
    fullName: string;
    country: string | null;
  }): Promise<DigestStats> {
    const [contracts, transactions] = await Promise.all([
      DigestRepository.contractsForUser(user.id, user.email ?? ''),
      DigestRepository.walletTxCount(user.id),
    ]);
    const projectsCompleted = contracts.filter((contract) => contract.status === 'COMPLETED').length;
    const projectsActive = contracts.filter((contract) =>
      ACTIVE_STATUSES.includes(contract.status),
    ).length;

    const accounts = await DigestRepository.escrowAccountsForContracts(
      contracts.map((contract) => contract.id),
    );
    const protectedUsd = accounts.reduce(
      (total, account) =>
        total +
        toUsd(
          Number(account.heldAmount) + Number(account.releasedAmount) + Number(account.refundedAmount),
          account.currency,
        ),
      0,
    );
    const homeCurrency = homeCurrencyFor(user.country);

    return {
      firstName: user.fullName.split(' ')[0] || 'there',
      projectsTotal: contracts.length,
      projectsCompleted,
      projectsActive,
      transactions,
      protectedLabel: moneyLabel(fromUsd(protectedUsd, homeCurrency), homeCurrency),
      homeCurrency,
    };
  },

  /**
   * Build and enqueue the weekly digest for every active user who has any
   * activity (at least one project or transaction) - a brand-new empty account
   * gets nothing rather than a hollow "0 projects" email.
   */
  async runWeeklyBroadcast(): Promise<{ candidates: number; sent: number }> {
    const users = await DigestRepository.candidateUsers();
    let sent = 0;
    for (const user of users) {
      try {
        if (!user.email) continue; // the digest is an email - skip email-less accounts
        const stats = await this.buildForUser(user);
        if (stats.projectsTotal === 0 && stats.transactions === 0) continue;
        await enqueueEmail({ kind: 'weekly-digest', to: user.email, name: user.fullName, stats });
        sent += 1;
      } catch (error) {
        console.warn('[digest] failed for', user.id, (error as Error).message);
      }
    }
    console.log(`[digest] weekly broadcast enqueued ${sent}/${users.length}`);
    return { candidates: users.length, sent };
  },
};
