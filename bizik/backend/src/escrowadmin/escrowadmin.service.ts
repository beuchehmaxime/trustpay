import { EscrowTransaction, MilestoneStatus } from '@prisma/client';

import { AppError } from '../lib/errors';
import { recordAudit } from '../lib/audit';
import { round2 } from '../lib/fees';
import { EscrowRepository } from '../escrow/escrow.repository';
import { EscrowService } from '../escrow/escrow.service';
import { AccountFilter, EscrowAdminRepository, LedgerFilter } from './escrowadmin.repository';

type ContractMeta = {
  id: string;
  title: string;
  status: string;
  creatorId: string;
  counterpartyName: string;
};

/** Milestone statuses where money is still held in escrow. */
const HELD_STATUSES: MilestoneStatus[] = ['FUNDED', 'ACTIVE', 'SUBMITTED', 'APPROVED'];

/** Stable numeric ref derived from an id, prefixed (QPR- for contracts, QTX- for txns). */
function refFrom(id: string, prefix: string, digits: number): string {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  const mod = 10 ** digits;
  return `${prefix}-${(Math.abs(hash) % (mod - mod / 10)) + mod / 10}`;
}

type ContractParties = {
  creatorId: string;
  counterpartyId: string | null;
  counterpartyName: string | null;
  creatorIsPayer: boolean;
} | null;

/** Resolve a contract's payer (client) and payee (freelancer) display names. */
async function resolveParties(
  contract: ContractParties,
): Promise<{ payerName: string | null; payeeName: string | null }> {
  if (!contract) return { payerName: null, payeeName: null };
  const userIds = [contract.creatorId, contract.counterpartyId].filter(Boolean) as string[];
  const users = await EscrowAdminRepository.getUsersByIds(userIds);
  const nameById = new Map(users.map((user) => [user.id, user.fullName]));
  const creatorName = nameById.get(contract.creatorId) ?? 'Unknown';
  const counterpartyName = contract.counterpartyId
    ? (nameById.get(contract.counterpartyId) ?? contract.counterpartyName)
    : contract.counterpartyName;
  return {
    payerName: contract.creatorIsPayer ? creatorName : counterpartyName,
    payeeName: contract.creatorIsPayer ? counterpartyName : creatorName,
  };
}

function transactionDto(
  transaction: EscrowTransaction & { escrowAccount?: { contractId: string } },
) {
  return {
    id: transaction.id,
    reference: refFrom(transaction.id, 'QTX', 5),
    escrowAccountId: transaction.escrowAccountId,
    contractId: transaction.escrowAccount?.contractId ?? null,
    milestoneId: transaction.milestoneId,
    type: transaction.type,
    amount: Number(transaction.amount),
    currency: transaction.currency,
    status: transaction.status,
    gateway: transaction.gateway,
    gatewayRef: transaction.gatewayRef,
    note: transaction.note,
    createdAt: transaction.createdAt,
    completedAt: transaction.completedAt,
  };
}

export const EscrowAdminService = {
  /** Paginated escrow-account list (escrow.view). */
  async listAccounts(filters: AccountFilter, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [accounts, total] = await Promise.all([
      EscrowAdminRepository.listAccounts(filters, skip, pageSize),
      EscrowAdminRepository.countAccounts(filters),
    ]);
    const contractIds = [...new Set(accounts.map((account) => account.contractId))];
    const contracts = (await EscrowAdminRepository.getContractsByIds(contractIds)) as ContractMeta[];
    const contractsById = new Map(contracts.map((contract) => [contract.id, contract]));

    return {
      items: accounts.map((account) => {
        const contract = contractsById.get(account.contractId);
        return {
          id: account.id,
          contractId: account.contractId,
          subAccountRef: account.subAccountRef,
          contractTitle: contract?.title ?? 'Unknown project',
          contractStatus: contract?.status ?? null,
          counterparty: contract?.counterpartyName ?? null,
          currency: account.currency,
          held: Number(account.heldAmount),
          released: Number(account.releasedAmount),
          refunded: Number(account.refundedAmount),
          status: account.status,
          transactionCount: account._count.transactions,
          refundCount: account._count.refunds,
          updatedAt: account.updatedAt,
        };
      }),
      page,
      pageSize,
      total,
    };
  },

  /** KPI aggregates: balances grouped by currency + account status counts. */
  async stats() {
    const [byCurrency, statusRows] = await Promise.all([
      EscrowAdminRepository.aggregatesByCurrency(),
      EscrowAdminRepository.statusCounts(),
    ]);
    const statusCounts: Record<string, number> = {};
    for (const row of statusRows) statusCounts[row.status] = row._count._all;
    const totalAccounts = statusRows.reduce((sum, row) => sum + row._count._all, 0);

    return {
      totalAccounts,
      open: statusCounts.OPEN ?? 0,
      partiallyReleased: statusCounts.PARTIALLY_RELEASED ?? 0,
      released: statusCounts.RELEASED ?? 0,
      refunded: statusCounts.REFUNDED ?? 0,
      frozen: statusCounts.FROZEN ?? 0,
      byCurrency: byCurrency.map((row) => ({
        currency: row.currency,
        held: Number(row._sum.heldAmount ?? 0),
        released: Number(row._sum.releasedAmount ?? 0),
        refunded: Number(row._sum.refundedAmount ?? 0),
        accounts: row._count._all,
      })),
    };
  },

  /** Global transaction ledger (escrow.view). */
  async ledger(filters: LedgerFilter, page: number, pageSize: number) {
    const skip = (page - 1) * pageSize;
    const [transactions, total] = await Promise.all([
      EscrowAdminRepository.listTransactions(filters, skip, pageSize),
      EscrowAdminRepository.countTransactions(filters),
    ]);
    return {
      items: transactions.map(transactionDto),
      page,
      pageSize,
      total,
    };
  },

  /** Single transaction detail for the ledger drill-down (escrow.view). */
  async transactionDetail(id: string) {
    const transaction = await EscrowAdminRepository.getTransactionById(id);
    if (!transaction) throw new AppError(404, 'Q-404', 'Transaction not found');

    const contractId = transaction.escrowAccount?.contractId ?? null;
    const contract = contractId
      ? await EscrowAdminRepository.getContractWithMilestones(contractId)
      : null;
    const { payerName, payeeName } = await resolveParties(contract);

    const milestone = transaction.milestoneId
      ? await EscrowAdminRepository.getMilestoneById(transaction.milestoneId)
      : null;

    return {
      ...transactionDto(transaction),
      completedAt: transaction.completedAt,
      account: transaction.escrowAccount
        ? {
            id: transaction.escrowAccount.id,
            subAccountRef: transaction.escrowAccount.subAccountRef,
            currency: transaction.escrowAccount.currency,
            status: transaction.escrowAccount.status,
            held: Number(transaction.escrowAccount.heldAmount),
            released: Number(transaction.escrowAccount.releasedAmount),
          }
        : null,
      contract: contract
        ? { id: contract.id, title: contract.title, status: contract.status }
        : null,
      payerName,
      payeeName,
      milestone: milestone
        ? {
            id: milestone.id,
            order: milestone.order,
            title: milestone.title,
            amount: Number(milestone.amount),
            currency: milestone.currency,
            status: milestone.status,
          }
        : null,
    };
  },

  async accountDetail(id: string) {
    const account = await EscrowAdminRepository.getAccountById(id);
    if (!account) throw new AppError(404, 'Q-404', 'Escrow account not found');
    const contract = await EscrowAdminRepository.getContractWithMilestones(account.contractId);

    const { payerName, payeeName } = await resolveParties(contract);

    const heldMilestones = (contract?.milestones ?? []).filter((milestone) =>
      HELD_STATUSES.includes(milestone.status),
    );
    const expectedHeld = round2(
      heldMilestones.reduce((sum, milestone) => sum + Number(milestone.amount), 0),
    );
    const actualHeld = Number(account.heldAmount);

    return {
      id: account.id,
      reference: refFrom(account.contractId, 'QPR', 4),
      contractId: account.contractId,
      subAccountRef: account.subAccountRef,
      currency: account.currency,
      held: actualHeld,
      released: Number(account.releasedAmount),
      refunded: Number(account.refundedAmount),
      status: account.status,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
      contractTitle: contract?.title ?? null,
      payerName,
      payeeName,
      contract: contract
        ? { id: contract.id, title: contract.title, status: contract.status }
        : null,
      reconciliation: {
        expectedHeld,
        actualHeld,
        difference: round2(actualHeld - expectedHeld),
        balanced: round2(actualHeld - expectedHeld) === 0,
      },
      milestones: (contract?.milestones ?? []).map((milestone) => ({
        id: milestone.id,
        order: milestone.order,
        title: milestone.title,
        amount: Number(milestone.amount),
        currency: milestone.currency,
        status: milestone.status,
        held: HELD_STATUSES.includes(milestone.status),
      })),
      transactions: account.transactions.map(transactionDto),
      refunds: account.refunds.map((refund) => ({
        id: refund.id,
        amount: Number(refund.amount),
        currency: refund.currency,
        reasonCode: refund.reasonCode,
        status: refund.status,
        createdAt: refund.createdAt,
      })),
      fees: account.fees.map((fee) => ({
        id: fee.id,
        type: fee.type,
        amount: Number(fee.amount),
        currency: fee.currency,
        createdAt: fee.createdAt,
      })),
    };
  },

  /** Manually release a held milestone's funds to the payee (escrow.manage). */
  async releaseMilestone(adminId: string, milestoneId: string) {
    const milestone = await EscrowRepository.getMilestone(milestoneId);
    if (!milestone) throw new AppError(404, 'Q-404', 'Milestone not found');
    await EscrowService._releaseCore(milestoneId, { actorUserId: adminId, auto: true });
    void recordAudit({
      actorId: adminId,
      action: 'escrow.manual_release',
      entityType: 'Milestone',
      entityId: milestoneId,
      after: { contractId: milestone.contractId, amount: Number(milestone.amount) },
    });
    const account = await EscrowRepository.getAccountByContract(milestone.contractId);
    return this.accountDetail(account!.id);
  },

  /** Manually refund a held milestone to the payer (escrow.manage). */
  async refundMilestone(adminId: string, milestoneId: string, reason?: string) {
    const milestone = await EscrowRepository.getMilestone(milestoneId);
    if (!milestone) throw new AppError(404, 'Q-404', 'Milestone not found');
    await EscrowService._refundMilestoneCore(milestone, adminId, reason ?? 'ADMIN_REFUND');
    void recordAudit({
      actorId: adminId,
      action: 'escrow.manual_refund',
      entityType: 'Milestone',
      entityId: milestoneId,
      after: { contractId: milestone.contractId, amount: Number(milestone.amount), reason },
    });
    const account = await EscrowRepository.getAccountByContract(milestone.contractId);
    return this.accountDetail(account!.id);
  },

  /** Post a manual ledger adjustment to an account's held balance (escrow.manage). */
  async adjust(adminId: string, accountId: string, delta: number, note: string) {
    const account = await EscrowAdminRepository.getAccountById(accountId);
    if (!account) throw new AppError(404, 'Q-404', 'Escrow account not found');
    const newHeld = round2(Number(account.heldAmount) + delta);
    if (newHeld < 0) {
      throw new AppError(409, 'Q-409', 'Adjustment would make the held balance negative.');
    }
    await EscrowAdminRepository.updateAccount(accountId, { heldAmount: newHeld });
    await EscrowAdminRepository.createTransaction({
      escrowAccountId: accountId,
      type: 'ADJUSTMENT',
      amount: round2(delta),
      currency: account.currency,
      status: 'COMPLETED',
      note,
      completedAt: new Date(),
    });
    void recordAudit({
      actorId: adminId,
      action: 'escrow.adjustment',
      entityType: 'EscrowAccount',
      entityId: accountId,
      before: { heldAmount: Number(account.heldAmount) },
      after: { heldAmount: newHeld, delta, note },
    });
    return this.accountDetail(accountId);
  },

  /** Recompute expected vs actual held and record the reconciliation (escrow.manage). */
  async reconcile(adminId: string, accountId: string) {
    const detail = await this.accountDetail(accountId);
    void recordAudit({
      actorId: adminId,
      action: 'escrow.reconcile',
      entityType: 'EscrowAccount',
      entityId: accountId,
      after: detail.reconciliation,
    });
    return detail;
  },
};
