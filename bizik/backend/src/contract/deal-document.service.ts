import { config } from '../config/env';
import { isLiveMilestone } from '../lib/contract-flow';
import { resolveParties } from '../lib/contract-flow';
import { CONTRACT_STATUS_LABEL, MILESTONE_STATUS_LABEL } from '../lib/domain';
import { AppError } from '../lib/errors';
import { clientServiceFee, freelancerFee, round2 } from '../lib/fees';
import { prisma } from '../lib/prisma';
import { buildDealReceiptPdf, type DealReceiptLine } from '../lib/receipt-pdf';

/**
 * The document a party can hand to an accountant: what the deal was, who the
 * parties were, every milestone, and what it cost them.
 *
 * It is written from the READER's side. A payer gets a payment record showing
 * the service fee added on top; a payee gets an earnings record showing their
 * fee deducted. The same deal produces two honest but different documents,
 * because the two parties genuinely paid and received different amounts.
 */
export const DealDocumentService = {
  async receipt(userId: string, contractId: string): Promise<{ pdf: Uint8Array; fileName: string }> {
    const contract = await prisma.contract.findUnique({
      where: { id: contractId },
      include: { milestones: { orderBy: { order: 'asc' } } },
    });
    if (!contract) throw new AppError(404, 'Q-404', 'Deal not found');
    if (contract.creatorId !== userId && contract.counterpartyId !== userId) {
      throw new AppError(403, 'Q-403', 'This deal was not shared with you.');
    }

    const { payerId, payeeId } = resolveParties(contract);
    const viewerIsPayer = payerId === userId;

    const ids = [contract.creatorId, contract.counterpartyId].filter(Boolean) as string[];
    const people = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    const nameOf = (id: string | null) =>
      (id ? people.find((person) => person.id === id)?.fullName : null) ??
      contract.counterpartyName ??
      'Invited user';

    // Cancelled milestones are history: they are shown for completeness but
    // never counted, so the totals match what actually moved.
    const live = contract.milestones.filter(isLiveMilestone);
    const lines: DealReceiptLine[] = contract.milestones.map((milestone) => ({
      title: milestone.title,
      amount: Number(milestone.amount),
      statusLabel: MILESTONE_STATUS_LABEL[milestone.status],
      dueDate: milestone.deadline ? milestone.deadline.toISOString().slice(0, 10) : null,
    }));

    const subtotal = round2(live.reduce((sum, milestone) => sum + Number(milestone.amount), 0));
    // The payer pays the service fee on top; the payee has their fee deducted.
    const fee = viewerIsPayer ? clientServiceFee(subtotal) : freelancerFee(subtotal);
    const total = viewerIsPayer ? round2(subtotal + fee) : round2(subtotal - fee);

    const released = round2(
      live
        .filter((milestone) => milestone.status === 'RELEASED')
        .reduce((sum, milestone) => sum + Number(milestone.amount), 0),
    );
    const held = round2(
      live
        .filter((milestone) => ['FUNDED', 'ACTIVE', 'SUBMITTED', 'APPROVED'].includes(milestone.status))
        .reduce((sum, milestone) => sum + Number(milestone.amount), 0),
    );

    const pdf = await buildDealReceiptPdf({
      reference: contract.id,
      title: contract.title,
      statusLabel: contract.accepted
        ? CONTRACT_STATUS_LABEL[contract.status]
        : contract.status === 'CANCELLED'
          ? CONTRACT_STATUS_LABEL.CANCELLED
          : 'Pending',
      createdLabel: contract.createdAt.toLocaleString('en-US', { dateStyle: 'medium' }),
      currency: contract.currency,
      payerName: nameOf(payerId),
      payeeName: nameOf(payeeId),
      viewerIsPayer,
      lines,
      subtotal,
      fee,
      total,
      feeLabel: viewerIsPayer
        ? `BiZik service fee (${(config.fees.clientServicePct * 100).toFixed(1)}%)`
        : `BiZik fee (${(config.fees.freelancerFeePct * 100).toFixed(1)}%)`,
      totalLabel: viewerIsPayer ? 'Total paid' : 'Net to you',
      releasedToDate: released,
      heldInEscrow: held,
    });

    return { pdf, fileName: `bizik-${contract.id}.pdf` };
  },
};
