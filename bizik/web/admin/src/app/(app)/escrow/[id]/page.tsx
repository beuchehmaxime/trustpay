'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  Landmark,
  Loader2,
  Lock,
  RefreshCw,
  Send,
  SlidersHorizontal,
  Undo2,
} from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { STATUS_TONE, type StatusTone } from '@/lib/status-tone';
import { useEscrowAccount, useEscrowActions } from '@/features/escrow/hooks';
import { AccountStatusBadge, money } from '@/features/escrow/escrow-ui';
import type {
  EscrowAccountDetail,
  EscrowMilestone,
  LedgerTransaction,
  TxStatusValue,
} from '@/features/escrow/types';

type ModalKind = 'release' | 'refund' | 'adjust' | null;

const TX_STATUS_TONE: Record<TxStatusValue, StatusTone> = {
  PENDING: 'warning',
  PROCESSING: 'warning',
  COMPLETED: 'positive',
  FAILED: 'negative',
  REVERSED: 'neutral',
};

function txDate(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

/** A milestone tag like "M2" from the transaction's milestoneId. */
function useMilestoneTags(milestones: EscrowMilestone[]) {
  const orderById = new Map(milestones.map((milestone) => [milestone.id, milestone.order]));
  return (milestoneId: string | null) => (milestoneId ? orderById.get(milestoneId) : undefined);
}

function txLabel(transaction: LedgerTransaction, order?: number): string {
  const tag = order ? ` - M${order}` : '';
  switch (transaction.type) {
    case 'FUND':
    case 'HOLD':
      return `Deposit${tag}`;
    case 'RELEASE':
      return `Release${tag}`;
    case 'REFUND':
      return `Refund${tag}`;
    case 'ADJUSTMENT':
      return 'Adjustment';
    default:
      return transaction.type;
  }
}

/** Signed amount: deposits add to escrow (+), releases/refunds leave it (−). */
function txSigned(transaction: LedgerTransaction): number {
  if (transaction.type === 'RELEASE' || transaction.type === 'REFUND') return -transaction.amount;
  return transaction.amount;
}

export default function EscrowAccountDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canView = usePermission('escrow.view');
  const canManage = usePermission('escrow.manage');

  const { data: account, isLoading, isError, error } = useEscrowAccount(id);
  const actions = useEscrowActions();
  const [modal, setModal] = useState<ModalKind>(null);
  const tagFor = useMilestoneTags(account?.milestones ?? []);

  async function onReconcile() {
    try {
      await actions.reconcile.mutateAsync(id);
      toast.success('Reconciliation recorded');
    } catch (reconcileError) {
      toast.error('Could not reconcile', { description: normaliseError(reconcileError).message });
    }
  }

  if (!canView) return <NoAccess />;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !account) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {isError ? normaliseError(error).message : 'Escrow account not found.'}
        </div>
      </div>
    );
  }

  const heldMilestones = account.milestones.filter((milestone) => milestone.held);
  const releasedMilestones = account.milestones.filter((milestone) => milestone.status === 'RELEASED');
  const pendingMilestones = account.milestones.filter((milestone) => milestone.status === 'PENDING');
  const unfundedTotal = pendingMilestones.reduce((sum, milestone) => sum + milestone.amount, 0);
  const tags = (list: EscrowMilestone[]) => list.map((milestone) => `M${milestone.order}`).join(' + ');
  const recon = account.reconciliation;
  const gatewayLines = account.transactions
    .filter((transaction) => transaction.gatewayRef)
    .slice(0, 8);

  return (
    <div className="space-y-6">
      {/* Module header */}
      <div>
        <p className="text-xs font-semibold tracking-wider text-brand-600 uppercase">BiZik Admin</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Escrow &amp; transactions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The financial ledger - every movement of money.
        </p>
      </div>

      <BackLink />

      {/* Account header + actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-ink text-white">
            <Landmark className="size-6" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-ink">
                Escrow account - {account.reference}
              </h2>
              <AccountStatusBadge status={account.status} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {[
                account.contractTitle,
                account.payerName && account.payeeName
                  ? `${account.payerName} ↔ ${account.payeeName}`
                  : null,
                account.currency,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setModal('release')}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
            >
              <Send className="size-4" /> Manual release
            </button>
            <button
              type="button"
              onClick={() => setModal('refund')}
              className="inline-flex items-center gap-2 rounded-lg border border-negative/40 bg-white px-4 py-2 text-sm font-semibold text-negative transition hover:bg-negative-bg/50"
            >
              <Undo2 className="size-4" /> Refund to client
            </button>
            <button
              type="button"
              onClick={() => setModal('adjust')}
              className="inline-flex items-center gap-2 rounded-lg border border-field bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-muted"
            >
              <SlidersHorizontal className="size-4" /> Adjustment
            </button>
          </div>
        ) : null}
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Held in escrow"
          value={money(account.held, account.currency)}
          note={heldMilestones.length ? tags(heldMilestones) : '-'}
        />
        <KpiCard
          label="Released"
          value={money(account.released, account.currency)}
          note={releasedMilestones.length ? `${tags(releasedMilestones)} · approved` : '-'}
          tone="positive"
        />
        <KpiCard
          label="Refunded"
          value={money(account.refunded, account.currency)}
          note={account.refunds.length ? `${account.refunds.length} refund(s)` : '-'}
        />
        <KpiCard
          label="Unfunded"
          value={money(unfundedTotal, account.currency)}
          note={pendingMilestones.length ? tags(pendingMilestones) : '-'}
          muted
        />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: account history */}
        <div className="lg:col-span-2">
          <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <p className="border-b border-hairline px-5 py-4 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Account history
            </p>
            {account.transactions.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                No transactions on this account yet.
              </p>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-hairline text-left text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                    <th className="px-5 py-2.5">Reference</th>
                    <th className="py-2.5">Type</th>
                    <th className="py-2.5">Amount</th>
                    <th className="py-2.5">Date</th>
                    <th className="py-2.5 pr-5">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {account.transactions.map((transaction) => {
                    const signed = txSigned(transaction);
                    return (
                      <tr key={transaction.id} className="border-b border-hairline last:border-0">
                        <td className="px-5 py-3.5 font-mono text-xs font-medium text-ink">
                          {transaction.reference}
                        </td>
                        <td className="py-3.5 text-ink">
                          {txLabel(transaction, tagFor(transaction.milestoneId))}
                          {transaction.note ? (
                            <span className="ml-1 text-xs text-muted-foreground">
                              · {transaction.note}
                            </span>
                          ) : null}
                        </td>
                        <td
                          className={cn(
                            'py-3.5 font-semibold',
                            signed >= 0 ? 'text-positive' : 'text-ink',
                          )}
                        >
                          {signed >= 0 ? '+' : '−'}
                          {money(Math.abs(signed), transaction.currency)}
                        </td>
                        <td className="py-3.5 text-muted-foreground">
                          {txDate(transaction.createdAt)}
                        </td>
                        <td className="py-3.5 pr-5">
                          <span
                            className={cn(
                              'inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase',
                              STATUS_TONE[TX_STATUS_TONE[transaction.status]],
                            )}
                          >
                            {transaction.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: reconciliation, gateway log, fees, refunds */}
        <div className="space-y-5 lg:col-span-1">
          {/* Reconciliation */}
          <SectionCard
            label="Reconciliation"
            action={
              canManage ? (
                <button
                  type="button"
                  onClick={onReconcile}
                  disabled={actions.reconcile.isPending}
                  className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-600 hover:opacity-80 disabled:opacity-50"
                >
                  <RefreshCw
                    className={cn('size-3', actions.reconcile.isPending && 'animate-spin')}
                  />
                  Re-check
                </button>
              ) : null
            }
          >
            <dl className="space-y-2.5 text-sm">
              <Row label="Ledger balance" value={money(recon.actualHeld, account.currency)} strong />
              <Row label="Expected balance" value={money(recon.expectedHeld, account.currency)} strong />
              <Row
                label="Status"
                value={
                  recon.balanced ? (
                    <span className="font-semibold text-positive">✓ Reconciled</span>
                  ) : (
                    <span className="font-semibold text-amber-700">
                      ⚠ Off by {money(Math.abs(recon.difference), account.currency)}
                    </span>
                  )
                }
              />
            </dl>
          </SectionCard>

          {/* Gateway log */}
          <SectionCard label="Gateway log">
            {gatewayLines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No gateway events recorded.</p>
            ) : (
              <div className="space-y-1 font-mono text-[11px] leading-relaxed text-muted-foreground">
                {gatewayLines.map((transaction) => (
                  <p key={transaction.id} className="truncate">
                    <span className="text-ink">
                      {new Date(transaction.createdAt).toLocaleTimeString('en-GB', {
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>{' '}
                    {(transaction.gateway ?? 'internal').toLowerCase()}{' '}
                    {transaction.gatewayRef?.slice(0, 12)}… {transaction.type.toLowerCase()}{' '}
                    <span className="text-positive">✓</span>
                  </p>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Fees (kept) */}
          <SectionCard label={`Fees collected (${account.fees.length})`}>
            {account.fees.length === 0 ? (
              <p className="text-sm text-muted-foreground">No fees recorded.</p>
            ) : (
              <div className="space-y-2">
                {account.fees.map((fee) => (
                  <div key={fee.id} className="flex items-center justify-between text-sm">
                    <span className="capitalize text-ink">
                      {fee.type.toLowerCase().replace(/_/g, ' ')}
                    </span>
                    <span className="font-medium text-ink">{money(fee.amount, fee.currency)}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Refunds (kept) */}
          <SectionCard label={`Refunds (${account.refunds.length})`}>
            {account.refunds.length === 0 ? (
              <p className="text-sm text-muted-foreground">No refunds.</p>
            ) : (
              <div className="space-y-2">
                {account.refunds.map((refund) => (
                  <div key={refund.id} className="flex items-center justify-between text-sm">
                    <span className="text-ink">{money(refund.amount, refund.currency)}</span>
                    <span className="text-xs text-muted-foreground">{refund.reasonCode}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <ReleaseModal
        open={modal === 'release'}
        onClose={() => setModal(null)}
        account={account}
        heldMilestones={heldMilestones}
        pending={actions.release.isPending}
        onRelease={async (milestoneId) => {
          try {
            await actions.release.mutateAsync(milestoneId);
            toast.success('Funds released to payee');
            setModal(null);
          } catch (actionError) {
            toast.error('Release failed', { description: normaliseError(actionError).message });
          }
        }}
      />

      <RefundModal
        open={modal === 'refund'}
        onClose={() => setModal(null)}
        account={account}
        heldMilestones={heldMilestones}
        pending={actions.refund.isPending}
        onRefund={async (milestoneId, reason) => {
          try {
            await actions.refund.mutateAsync({ milestoneId, reason });
            toast.success('Funds refunded to client');
            setModal(null);
          } catch (actionError) {
            toast.error('Refund failed', { description: normaliseError(actionError).message });
          }
        }}
      />

      <AdjustModal
        open={modal === 'adjust'}
        onClose={() => setModal(null)}
        account={account}
        pending={actions.adjust.isPending}
        onAdjust={async (delta, note) => {
          try {
            await actions.adjust.mutateAsync({ id: account.id, delta, note });
            toast.success('Adjustment posted');
            setModal(null);
          } catch (actionError) {
            toast.error('Adjustment failed', { description: normaliseError(actionError).message });
          }
        }}
      />
    </div>
  );
}

function ReleaseModal({
  open,
  onClose,
  account,
  heldMilestones,
  pending,
  onRelease,
}: {
  open: boolean;
  onClose: () => void;
  account: EscrowAccountDetail;
  heldMilestones: EscrowMilestone[];
  pending: boolean;
  onRelease: (milestoneId: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Manual release</DialogTitle>
          <DialogDescription>
            Release held funds to the payee. The freelancer fee is deducted and the net is credited
            to their wallet immediately.
          </DialogDescription>
        </DialogHeader>
        <MilestonePicker
          milestones={heldMilestones}
          account={account}
          empty="No funds are currently held on this account."
          actionLabel="Release"
          actionTone="positive"
          pending={pending}
          onAction={onRelease}
        />
      </DialogContent>
    </Dialog>
  );
}

function RefundModal({
  open,
  onClose,
  account,
  heldMilestones,
  pending,
  onRefund,
}: {
  open: boolean;
  onClose: () => void;
  account: EscrowAccountDetail;
  heldMilestones: EscrowMilestone[];
  pending: boolean;
  onRefund: (milestoneId: string, reason?: string) => void;
}) {
  const [reason, setReason] = useState('');
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-lg">Refund to client</DialogTitle>
          <DialogDescription>
            Return a held milestone’s funds to the payer. The milestone reverts to unfunded.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Reason (optional)</label>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={2}
            placeholder="Why is this being refunded…"
            className="w-full rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
          />
        </div>
        <MilestonePicker
          milestones={heldMilestones}
          account={account}
          empty="No funds are currently held to refund."
          actionLabel="Refund"
          actionTone="negative"
          pending={pending}
          onAction={(milestoneId) => onRefund(milestoneId, reason.trim() || undefined)}
        />
      </DialogContent>
    </Dialog>
  );
}

function MilestonePicker({
  milestones,
  account,
  empty,
  actionLabel,
  actionTone,
  pending,
  onAction,
}: {
  milestones: EscrowMilestone[];
  account: EscrowAccountDetail;
  empty: string;
  actionLabel: string;
  actionTone: 'positive' | 'negative';
  pending: boolean;
  onAction: (milestoneId: string) => void;
}) {
  if (milestones.length === 0) {
    return <p className="py-4 text-sm text-muted-foreground">{empty}</p>;
  }
  const toneClass =
    actionTone === 'positive'
      ? 'border-positive/30 text-positive hover:bg-positive-bg/50'
      : 'border-negative/40 text-negative hover:bg-negative-bg/50';
  return (
    <div className="space-y-2">
      {milestones.map((milestone) => (
        <div
          key={milestone.id}
          className="flex items-center justify-between gap-3 rounded-lg border border-hairline px-4 py-3"
        >
          <div>
            <p className="font-medium text-ink">
              <span className="text-xs text-muted-foreground">M{milestone.order} · </span>
              {milestone.title}
            </p>
            <p className="text-sm font-semibold text-ink">
              {money(milestone.amount, account.currency)}
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => onAction(milestone.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50',
              toneClass,
            )}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {actionLabel}
          </button>
        </div>
      ))}
    </div>
  );
}

function AdjustModal({
  open,
  onClose,
  account,
  pending,
  onAdjust,
}: {
  open: boolean;
  onClose: () => void;
  account: EscrowAccountDetail;
  pending: boolean;
  onAdjust: (delta: number, note: string) => void;
}) {
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const parsed = Number(delta);
  const invalid = !Number.isFinite(parsed) || parsed === 0 || note.trim().length < 3;
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !pending && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">Ledger adjustment</DialogTitle>
          <DialogDescription>
            Correct the held balance. Use a negative amount to reduce it. Posts an ADJUSTMENT entry
            to the ledger and the audit log.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">
              Amount ({account.currency})
            </label>
            <input
              value={delta}
              onChange={(event) => setDelta(event.target.value)}
              inputMode="decimal"
              placeholder="e.g. -25.00"
              className="mt-1 h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Note (required)</label>
            <textarea
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={2}
              placeholder="Reason for the adjustment…"
              className="mt-1 w-full rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="rounded-lg border border-field px-4 py-2 text-sm font-medium text-ink transition hover:bg-muted disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onAdjust(parsed, note.trim())}
              disabled={pending || invalid}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : null}
              Post adjustment
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({
  label,
  value,
  note,
  tone = 'ink',
  muted,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'ink' | 'positive';
  muted?: boolean;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p
        className={cn(
          'mt-1 text-2xl font-bold',
          muted ? 'text-muted-foreground' : tone === 'positive' ? 'text-positive' : 'text-ink',
        )}
      >
        {value}
      </p>
      {note ? <p className="mt-1 text-xs text-muted-foreground">{note}</p> : null}
    </div>
  );
}

function SectionCard({
  label,
  action,
  children,
}: {
  label: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="mb-4 flex items-center justify-between">
        <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {label}
        </p>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(strong ? 'font-bold text-ink' : 'text-ink')}>{value}</dd>
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/escrow"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
    >
      <ArrowLeft className="size-4" /> Ledger
    </Link>
  );
}

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-24 text-center">
      <span className="flex size-12 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <Lock className="size-6" />
      </span>
      <p className="text-sm font-semibold text-ink">No access</p>
      <p className="max-w-sm text-xs text-muted-foreground">
        You don’t have permission to view this escrow account.
      </p>
    </div>
  );
}
