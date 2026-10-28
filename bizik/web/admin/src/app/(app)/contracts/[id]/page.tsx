'use client';

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Ban, CheckCircle2, FileText, Loader2, Lock, Paperclip } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { STATUS_TONE, type StatusTone } from '@/lib/status-tone';
import { useProject, useProjectActions } from '@/features/projects/hooks';
import { MilestoneStatusBadge, money } from '@/features/projects/projects-ui';
import type { ProjectDetail, ProjectMilestone, ProjectParty } from '@/features/projects/types';

interface PendingAction {
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  run: (value: string) => Promise<unknown>;
  tone?: 'default' | 'danger' | 'warning';
  icon?: ComponentType<{ className?: string }>;
  confirmIcon?: ComponentType<{ className?: string }>;
  subject?: { label: string; value: string };
  consequencesTitle?: string;
  consequences?: string[];
  input?: { label?: string; placeholder?: string; required?: boolean; minLength?: number };
}

function fullDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function shortDate(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

function signaturesLabel(count: number): string {
  if (count >= 2) return 'Both parties · e-signed';
  if (count === 1) return 'One party · e-signed';
  return 'Not signed';
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canView = usePermission('contracts.view');
  const canManage = usePermission('contracts.manage');

  const { data: project, isLoading, isError, error } = useProject(id);
  const actions = useProjectActions();
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [deliverablesOpen, setDeliverablesOpen] = useState(false);

  async function confirmPendingAction(value: string) {
    if (!pendingAction) return;
    try {
      await pendingAction.run(value);
      toast.success(pendingAction.successMessage);
    } catch (actionError) {
      toast.error('Action failed', { description: normaliseError(actionError).message });
    } finally {
      setPendingAction(null);
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
  if (isError || !project) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {isError ? normaliseError(error).message : 'Deal not found.'}
        </div>
      </div>
    );
  }

  const isClosed = project.status === 'COMPLETED' || project.status === 'CANCELLED';
  const busy = actions.forceCancel.isPending || actions.forceComplete.isPending;
  const payer = project.payerSide === 'creator' ? project.creator : project.counterparty;
  const payee = project.payerSide === 'creator' ? project.counterparty : project.creator;
  const approvedCount = project.milestones.filter(
    (milestone) => milestone.status === 'APPROVED' || milestone.status === 'RELEASED',
  ).length;
  const feePct =
    project.totalAmount > 0 ? Math.round((project.platformFees / project.totalAmount) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Module header */}
      <div>
        <p className="text-xs font-semibold tracking-wider text-brand-600 uppercase">BiZik Admin</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">Deals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Contracts and milestones across the platform.
        </p>
      </div>

      <BackLink />

      {/* Project header + actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-ink">{project.title}</h2>
            <StatusPill status={project.status} label={project.statusLabel} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {project.reference} · created {fullDate(project.createdAt)} · platform fee{' '}
            {money(project.platformFees, project.currency)} ({feePct}%)
          </p>
        </div>

        {canManage && !isClosed ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setPendingAction({
                  title: 'Force-complete this deal?',
                  description: 'Releases any held escrow to the payee and closes the deal.',
                  confirmLabel: 'Yes, Complete',
                  tone: 'default',
                  icon: CheckCircle2,
                  confirmIcon: CheckCircle2,
                  subject: { label: 'Deal', value: project.title },
                  consequencesTitle: 'What happens when you force-complete:',
                  consequences: [
                    'Any funds still held in escrow are released to the payee',
                    'The deal is marked COMPLETED',
                    'Recorded in the audit log with your operator ID',
                  ],
                  successMessage: 'Deal completed',
                  run: () => actions.forceComplete.mutateAsync(project.id),
                })
              }
              className="inline-flex items-center gap-2 rounded-lg border border-field bg-white px-4 py-2 text-sm font-semibold text-ink transition hover:bg-muted disabled:opacity-50"
            >
              <CheckCircle2 className="size-4" /> Force complete
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                setPendingAction({
                  title: 'Force-cancel this deal?',
                  description: 'Refunds any held escrow to the payer and cancels the deal.',
                  confirmLabel: 'Yes, Cancel deal',
                  tone: 'danger',
                  icon: Ban,
                  confirmIcon: Ban,
                  subject: { label: 'Deal', value: project.title },
                  consequencesTitle: 'What happens when you force-cancel:',
                  consequences: [
                    'Any funds still held in escrow are refunded to the payer',
                    'The deal is marked CANCELLED',
                    'Recorded in the audit log with your operator ID',
                  ],
                  input: {
                    label: 'Reason (optional)',
                    placeholder: 'Why is this deal being cancelled…',
                    required: false,
                  },
                  successMessage: 'Deal cancelled',
                  run: (value) =>
                    actions.forceCancel.mutateAsync({ id: project.id, reason: value || undefined }),
                })
              }
              className="inline-flex items-center gap-2 rounded-lg border border-negative/40 bg-white px-4 py-2 text-sm font-semibold text-negative transition hover:bg-negative-bg/50 disabled:opacity-50"
            >
              <Ban className="size-4" /> Force cancel
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Left: parties + contract */}
        <div className="space-y-5 lg:col-span-2">
          {/* Parties */}
          <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="flex items-center gap-3">
              <PartyBlock label="Client · Payer" party={payer} />
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              <PartyBlock label="Freelancer · Payee" party={payee} align="right" />
            </div>
          </div>

          {/* Contract */}
          <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <p className="mb-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Contract
            </p>
            <dl className="space-y-3 text-sm">
              <FactRow label="Total value" value={money(project.totalAmount, project.currency)} strong />
              <FactRow label="Currency" value={project.currency} />
              <FactRow
                label="Milestones approved"
                value={`${approvedCount} of ${project.milestones.length}`}
              />
              <FactRow label="Signatures" value={signaturesLabel(project.signatures)} />
            </dl>
            <button
              type="button"
              onClick={() => setDeliverablesOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
            >
              View deliverables <ArrowRight className="size-4" />
            </button>
          </div>
        </div>

        {/* Right: milestone timeline */}
        <div className="lg:col-span-3">
          <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <p className="mb-4 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Milestone timeline
            </p>
            {project.milestones.length === 0 ? (
              <p className="text-sm text-muted-foreground">No milestones on this contract.</p>
            ) : (
              <ol className="space-y-1">
                {project.milestones.map((milestone, index) => (
                  <TimelineRow
                    key={milestone.id}
                    milestone={milestone}
                    last={index === project.milestones.length - 1}
                  />
                ))}
              </ol>
            )}
          </div>
        </div>
      </div>

      <DeliverablesDialog
        open={deliverablesOpen}
        onOpenChange={setDeliverablesOpen}
        project={project}
      />

      <ConfirmDialog
        open={pendingAction !== null}
        onOpenChange={(next) => {
          if (!next) setPendingAction(null);
        }}
        title={pendingAction?.title ?? ''}
        description={pendingAction?.description}
        confirmLabel={pendingAction?.confirmLabel}
        tone={pendingAction?.tone}
        icon={pendingAction?.icon}
        confirmIcon={pendingAction?.confirmIcon}
        subject={pendingAction?.subject}
        consequencesTitle={pendingAction?.consequencesTitle}
        consequences={pendingAction?.consequences}
        input={pendingAction?.input}
        onConfirm={confirmPendingAction}
      />
    </div>
  );
}

const DOT_STYLE: Record<string, string> = {
  RELEASED: 'bg-positive',
  DISPUTED: 'bg-negative',
  PENDING: 'bg-muted-foreground/40',
};

function milestoneSubline(milestone: ProjectMilestone): string {
  switch (milestone.status) {
    case 'RELEASED':
    case 'APPROVED':
      return `Approved ${shortDate(milestone.approvedAt ?? milestone.releasedAt)}`;
    case 'DISPUTED':
      return `Submitted ${shortDate(milestone.submittedAt)} · disputed`;
    case 'SUBMITTED':
      return `Submitted ${shortDate(milestone.submittedAt)}`;
    default:
      return milestone.deadline ? `Due ${shortDate(milestone.deadline)}` : milestone.statusLabel;
  }
}

function TimelineRow({ milestone, last }: { milestone: ProjectMilestone; last: boolean }) {
  const dot = DOT_STYLE[milestone.status] ?? 'bg-ink';
  const label = milestone.status === 'PENDING' ? 'Unfunded' : milestone.statusLabel;
  return (
    <li className="flex gap-3">
      <div className="flex flex-col items-center">
        <span className={cn('mt-1.5 size-2.5 shrink-0 rounded-full', dot)} />
        {!last ? <span className="my-1 w-px flex-1 bg-hairline" /> : null}
      </div>
      <div className="flex flex-1 items-start justify-between gap-3 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-ink">{milestone.title}</span>
            <MilestoneStatusBadge status={milestone.status} label={label} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">{milestoneSubline(milestone)}</p>
        </div>
        <span className="shrink-0 font-bold text-ink">
          {money(milestone.amount, milestone.currency)}
        </span>
      </div>
    </li>
  );
}

function DeliverablesDialog({
  open,
  onOpenChange,
  project,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectDetail;
}) {
  const withContent = project.milestones.filter(
    (milestone) => milestone.deliverables.length > 0 || milestone.submissions.length > 0,
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="gap-1 border-b border-hairline p-5">
          <DialogTitle className="text-lg">Deliverables</DialogTitle>
          <DialogDescription>
            {project.title} · {project.reference}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[calc(85vh-8rem)] overflow-y-auto p-5">
          {withContent.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-12 text-center">
              <FileText className="size-8 text-muted-foreground/60" />
              <p className="text-sm text-muted-foreground">
                No deliverables or submissions have been uploaded yet.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {withContent.map((milestone) => (
                <div key={milestone.id}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-xs font-semibold text-muted-foreground">
                      #{milestone.order}
                    </span>
                    <span className="font-semibold text-ink">{milestone.title}</span>
                    <MilestoneStatusBadge status={milestone.status} label={milestone.statusLabel} />
                  </div>

                  {milestone.deliverables.length > 0 ? (
                    <div className="space-y-2">
                      {milestone.deliverables.map((deliverable) => (
                        <div
                          key={deliverable.id}
                          className="flex items-start justify-between gap-3 rounded-lg border border-hairline px-4 py-3"
                        >
                          <p className="text-sm text-ink">{deliverable.description}</p>
                          {deliverable.fileId ? <AttachmentChip /> : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No described deliverables.</p>
                  )}

                  {milestone.submissions.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {milestone.submissions.map((submission) => (
                        <div
                          key={submission.id}
                          className="rounded-lg border border-hairline bg-muted/40 px-4 py-3"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                              Submission · {fullDate(submission.createdAt)}
                            </span>
                            {submission.fileIds.length > 0 ? (
                              <AttachmentChip count={submission.fileIds.length} />
                            ) : null}
                          </div>
                          {submission.note ? (
                            <p className="mt-1 text-sm text-ink">{submission.note}</p>
                          ) : (
                            <p className="mt-1 text-sm text-muted-foreground">No note provided.</p>
                          )}
                          {submission.images && submission.images.length > 0 ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {submission.images.map((src, index) => (
                                <a key={index} href={src} target="_blank" rel="noreferrer">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={src}
                                    alt="Delivery"
                                    className="size-20 rounded-lg border border-hairline object-cover transition-opacity hover:opacity-90"
                                  />
                                </a>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AttachmentChip({ count }: { count?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
      <Paperclip className="size-3" />
      {count && count > 1 ? `${count} files` : 'Attachment'}
    </span>
  );
}

function PartyBlock({
  label,
  party,
  align = 'left',
}: {
  label: string;
  party: ProjectParty | null;
  align?: 'left' | 'right';
}) {
  return (
    <div className={cn('min-w-0 flex-1', align === 'right' && 'text-right')}>
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {party ? (
        <>
          <p className="mt-1 truncate font-semibold text-ink">{party.fullName}</p>
          {party.id ? (
            <Link href={`/users/${party.id}`} className="text-xs text-brand-600 hover:opacity-80">
              View account
            </Link>
          ) : (
            <p className="text-xs text-muted-foreground">Invited</p>
          )}
        </>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">-</p>
      )}
    </div>
  );
}

function FactRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn(strong ? 'font-bold text-ink' : 'font-medium text-ink')}>{value}</dd>
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const tone: StatusTone =
    status === 'DISPUTED'
      ? 'negative'
      : status === 'COMPLETED'
        ? 'positive'
        : status === 'CANCELLED'
          ? 'neutral'
          : 'info';
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        STATUS_TONE[tone],
      )}
    >
      {label}
    </span>
  );
}

function BackLink() {
  return (
    <Link
      href="/contracts"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
    >
      <ArrowLeft className="size-4" /> All deals
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
        You don’t have permission to view this deal.
      </p>
    </div>
  );
}
