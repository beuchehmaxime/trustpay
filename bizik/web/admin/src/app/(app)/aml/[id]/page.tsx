'use client';

import { useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  FileWarning,
  Loader2,
  Lock,
  PlayCircle,
  Snowflake,
} from 'lucide-react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { STATUS_TONE } from '@/lib/status-tone';
import { useAddAmlNote, useAmlActions, useAmlAlert, useAmlTimeline } from '@/features/aml/hooks';
import { AmlStatusBadge } from '@/features/aml/aml-ui';

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

function formatWhen(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${time}`;
}

function severityFor(risk: number): { label: string; className: string } {
  if (risk >= 85) return { label: 'Critical', className: STATUS_TONE.negative };
  if (risk >= 70) return { label: 'High', className: STATUS_TONE.warning };
  return { label: 'Medium', className: STATUS_TONE.neutral };
}

export default function AmlAlertDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canView = usePermission('aml.view');
  const canResolve = usePermission('aml.resolve');
  const canFreeze = usePermission('accounts.freeze');

  const { data: alert, isLoading, isError, error } = useAmlAlert(id);
  const { data: timeline } = useAmlTimeline(id);
  const actions = useAmlActions();
  const addNote = useAddAmlNote(id);
  const [note, setNote] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

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

  async function onAddNote() {
    if (note.trim().length === 0) return;
    try {
      await addNote.mutateAsync(note.trim());
      setNote('');
      toast.success('Note added to case file');
    } catch (noteError) {
      toast.error('Could not add note', { description: normaliseError(noteError).message });
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
  if (isError || !alert) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {isError ? normaliseError(error).message : 'Alert not found.'}
        </div>
      </div>
    );
  }

  const subjectName = alert.user?.fullName ?? 'Unknown subject';
  const isClosed = alert.status === 'CLEARED';
  const accountFrozen = alert.user?.status === 'FROZEN';
  const severity = severityFor(alert.riskScore);
  const busy =
    actions.review.isPending ||
    actions.clear.isPending ||
    actions.escalate.isPending ||
    actions.freeze.isPending ||
    actions.fileSar.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink">AML &amp; sanctions</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Screening alerts, risk cases and account freezes.
        </p>
      </div>

      <BackLink />

      {/* Case header */}
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-11 shrink-0 items-center justify-center rounded-full',
            severity.className,
          )}
        >
          <AlertTriangle className="size-5" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold tracking-tight text-ink">
              {alert.reference} - {alert.typeLabel}
            </h2>
            <span
              className={cn(
                'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
                severity.className,
              )}
            >
              {severity.label}
            </span>
            <AmlStatusBadge status={alert.status} label={alert.statusLabel} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Subject: <span className="font-medium text-ink">{subjectName}</span>
            {alert.user?.country ? ` · ${alert.user.country}` : ''} · triggered{' '}
            {formatWhen(alert.createdAt)}
          </p>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left column */}
        <div className="space-y-5 lg:col-span-2">
          <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="h-1 bg-negative/70" />
            <div className="p-5">
              <p className="mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                Why this triggered
              </p>
              <p className="text-sm leading-relaxed text-ink">{alert.whyTriggered}</p>
            </div>
          </div>

          <SectionCard label="Flagged transactions">
            {alert.transactionRef ? (
              <div className="flex items-center justify-between rounded-lg border border-hairline px-3 py-2 text-sm">
                <span className="font-medium text-ink">{alert.transactionRef}</span>
                <span className="text-muted-foreground">Linked transaction</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No transactions are linked to this case - it was raised by identity/sanctions
                screening rather than transaction monitoring.
              </p>
            )}
          </SectionCard>

          <SectionCard label="Case notes">
            {canResolve ? (
              <div className="space-y-2">
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  rows={3}
                  placeholder="Add an investigation note - visible to compliance operators and preserved in the case file…"
                  className="w-full rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={onAddNote}
                    disabled={addNote.isPending || note.trim().length === 0}
                    className="inline-flex items-center gap-2 rounded-lg border border-field px-4 py-2 text-sm font-medium text-ink transition hover:bg-muted disabled:opacity-50"
                  >
                    {addNote.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
                    Add note
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                You have view-only access - resolving permission is required to add notes.
              </p>
            )}
          </SectionCard>
        </div>

        {/* Right column */}
        <div className="space-y-5 lg:col-span-1">
          {/* Risk score */}
          <SectionCard label="Risk score">
            <p className="text-3xl font-bold text-ink">
              {alert.riskScore} <span className="text-base font-medium text-muted-foreground">/ 100</span>
            </p>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  'h-full rounded-full',
                  alert.riskScore >= 80
                    ? 'bg-negative'
                    : alert.riskScore >= 60
                      ? 'bg-amber-500'
                      : 'bg-positive',
                )}
                style={{ width: `${alert.riskScore}%` }}
              />
            </div>
          </SectionCard>

          {/* Original disposition card - RBAC-gated actions */}
          <SectionCard label="Disposition">
            {!canResolve && !canFreeze ? (
              <p className="text-sm text-muted-foreground">You have view-only access to this case.</p>
            ) : (
              <div className="space-y-2.5">
                {canResolve && alert.status === 'NEW' ? (
                  <ActionButton
                    tone="neutral"
                    icon={PlayCircle}
                    label="Start review"
                    disabled={busy}
                    onClick={() =>
                      actions.review
                        .mutateAsync(alert.id)
                        .then(() => toast.success('Case moved to review'))
                        .catch((actionError) =>
                          toast.error('Action failed', {
                            description: normaliseError(actionError).message,
                          }),
                        )
                    }
                  />
                ) : null}

                {canResolve && !isClosed ? (
                  <ActionButton
                    tone="positive"
                    icon={CheckCircle2}
                    label="Clear case"
                    disabled={busy}
                    onClick={() =>
                      setPendingAction({
                        title: 'Clear this alert?',
                        description: 'Marks the case as a false positive and closes it.',
                        confirmLabel: 'Yes, Clear',
                        tone: 'default',
                        icon: CheckCircle2,
                        confirmIcon: CheckCircle2,
                        subject: { label: 'Subject', value: subjectName },
                        consequences: accountFrozen
                          ? [
                              'The account is unfrozen and regains access',
                              'The case is closed as cleared',
                              'Recorded in the audit log with your operator ID',
                            ]
                          : [
                              'The case is closed as cleared',
                              'Recorded in the audit log with your operator ID',
                            ],
                        input: {
                          label: 'Reviewer note (optional)',
                          placeholder: 'Basis for clearing this alert…',
                          required: false,
                        },
                        successMessage: 'Case cleared',
                        run: (value) =>
                          actions.clear.mutateAsync({ id: alert.id, note: value || undefined }),
                      })
                    }
                  />
                ) : null}

                {canResolve && !isClosed ? (
                  <ActionButton
                    tone="neutral"
                    icon={ArrowUpRight}
                    label="Escalate to MLRO"
                    disabled={busy}
                    onClick={() =>
                      setPendingAction({
                        title: 'Escalate this case?',
                        description: 'Sends the case to a senior Compliance Officer / MLRO.',
                        confirmLabel: 'Yes, Escalate',
                        tone: 'warning',
                        icon: AlertTriangle,
                        confirmIcon: ArrowUpRight,
                        subject: { label: 'Subject', value: subjectName },
                        input: {
                          label: 'Escalation note (optional)',
                          placeholder: 'Why is this being escalated…',
                          required: false,
                        },
                        successMessage: 'Case escalated',
                        run: (value) =>
                          actions.escalate.mutateAsync({ id: alert.id, note: value || undefined }),
                      })
                    }
                  />
                ) : null}

                {canFreeze && alert.userId && !accountFrozen ? (
                  <ActionButton
                    tone="negative"
                    icon={Snowflake}
                    label="Freeze account"
                    disabled={busy}
                    onClick={() =>
                      setPendingAction({
                        title: 'Freeze this account?',
                        description: 'Blocks the subject account pending compliance review.',
                        confirmLabel: 'Yes, Freeze',
                        tone: 'danger',
                        icon: Snowflake,
                        confirmIcon: Snowflake,
                        subject: { label: 'Account', value: subjectName },
                        consequencesTitle: 'What happens when you freeze:',
                        consequences: [
                          'They’re signed out of all devices immediately',
                          'Wallet balances are locked - no payouts or transfers',
                          'You can unfreeze by clearing the case',
                        ],
                        successMessage: 'Account frozen',
                        run: () => actions.freeze.mutateAsync(alert.id),
                      })
                    }
                  />
                ) : null}

                {canResolve ? (
                  <ActionButton
                    tone="negative"
                    icon={FileWarning}
                    label="Resolve / file SAR"
                    disabled={busy}
                    onClick={() =>
                      setPendingAction({
                        title: 'File a Suspicious Activity Report?',
                        description: 'Records a SAR and escalates the case.',
                        confirmLabel: 'File SAR',
                        tone: 'danger',
                        icon: FileWarning,
                        confirmIcon: FileWarning,
                        subject: { label: 'Subject', value: subjectName },
                        input: {
                          label: 'SAR narrative (required)',
                          placeholder: 'Describe the suspicious activity and supporting facts…',
                          required: true,
                          minLength: 10,
                        },
                        successMessage: 'SAR filed',
                        run: (value) => actions.fileSar.mutateAsync({ id: alert.id, narrative: value }),
                      })
                    }
                  />
                ) : null}

                <p className="pt-1 text-xs text-muted-foreground">
                  Every decision is recorded in the audit log with your operator ID.
                </p>
              </div>
            )}
          </SectionCard>

          {/* Case timeline */}
          <SectionCard label="Case timeline">
            <ul className="space-y-2">
              {(timeline ?? []).map((event) => (
                <li key={event.id} className="flex gap-2 text-sm">
                  <span className="text-muted-foreground">-</span>
                  <span className="flex-1">
                    <span className={cn(event.kind === 'note' ? 'text-brand-700' : 'text-ink')}>
                      {event.label}
                    </span>{' '}
                    <span className="text-muted-foreground">- {formatWhen(event.at)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {alert.userId ? (
              <Link
                href={`/users/${alert.userId}`}
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:opacity-80"
              >
                Open user account <ArrowRight className="size-3.5" />
              </Link>
            ) : null}
          </SectionCard>
        </div>
      </div>

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

function ActionButton({
  tone,
  icon: Icon,
  label,
  onClick,
  disabled,
}: {
  tone: 'positive' | 'negative' | 'neutral';
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  const toneClass =
    tone === 'positive'
      ? 'border border-positive/30 text-positive hover:bg-positive-bg/50'
      : tone === 'negative'
        ? 'border border-negative/30 text-negative hover:bg-negative-bg/50'
        : 'border border-field text-ink hover:bg-muted';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition disabled:opacity-50',
        toneClass,
      )}
    >
      <Icon className="size-4" />
      {label}
    </button>
  );
}

function SectionCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="mb-4 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/aml"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
    >
      <ArrowLeft className="size-4" /> Alert queue
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
        You don’t have permission to view this case.
      </p>
    </div>
  );
}
