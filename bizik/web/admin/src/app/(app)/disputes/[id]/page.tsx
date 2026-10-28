'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowUpRight,
  FileText,
  Gavel,
  Loader2,
  Lock,
  Send,
  Sparkles,
  UserPlus,
} from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { avatarColor, initials } from '@/lib/avatar';
import { STATUS_TONE } from '@/lib/status-tone';
import {
  useDispute,
  useDisputeActions,
  useMediators,
} from '@/features/disputes/hooks';
import { DisputeStatusBadge, money, rulingLabel } from '@/features/disputes/disputes-ui';
import type { PartyRole, RulingType } from '@/features/disputes/types';

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DisputeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canView = usePermission('disputes.view');
  const canAssign = usePermission('disputes.assign');
  const canResolve = usePermission('disputes.resolve');

  const { data: dispute, isLoading, isError, error } = useDispute(id);
  const { data: mediators } = useMediators(canAssign);
  const actions = useDisputeActions();

  const [mediatorId, setMediatorId] = useState('');
  const [message, setMessage] = useState('');
  const [ruling, setRuling] = useState<RulingType>('PARTIAL_SPLIT');
  const [pct, setPct] = useState('50');
  const [rationale, setRationale] = useState('');
  const [confirmRuling, setConfirmRuling] = useState(false);
  const [confirmEscalate, setConfirmEscalate] = useState(false);

  if (!canView) return <NoAccess />;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !dispute) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {isError ? normaliseError(error).message : 'Dispute not found.'}
        </div>
      </div>
    );
  }

  const busy =
    actions.assign.isPending ||
    actions.escalate.isPending ||
    actions.message.isPending ||
    actions.rule.isPending;
  const freelancerPct = ruling === 'FULL_RELEASE' ? 100 : ruling === 'FULL_REFUND' ? 0 : Number(pct) || 0;
  const payeeShare = (dispute.amount * freelancerPct) / 100;
  const payerShare = dispute.amount - payeeShare;

  // Combined chronological feed of evidence, rebuttals and mediation messages.
  const feed: {
    id: string;
    by: string;
    role: PartyRole;
    body: string;
    at: string;
    files: number;
    images: string[];
  }[] = [
    ...dispute.evidence.map((item) => ({
      id: `ev-${item.id}`,
      by: item.by,
      role: item.byRole as PartyRole,
      body: item.description ?? 'Submitted supporting evidence.',
      at: item.createdAt,
      files: item.files,
      images: item.images ?? [],
    })),
    ...dispute.responses.map((item) => ({
      id: `re-${item.id}`,
      by: item.by,
      role: item.byRole,
      body: item.rebuttal,
      at: item.createdAt,
      files: 0,
      images: [] as string[],
    })),
    ...dispute.messages.map((item) => ({
      id: `ms-${item.id}`,
      by: item.by,
      role: item.byRole,
      body: item.body,
      at: item.createdAt,
      files: 0,
      images: [] as string[],
    })),
  ].sort((first, second) => new Date(first.at).getTime() - new Date(second.at).getTime());

  async function onAssign() {
    if (!mediatorId) return;
    try {
      await actions.assign.mutateAsync({ id, mediatorId });
      toast.success('Mediator assigned');
      setMediatorId('');
    } catch (assignError) {
      toast.error('Could not assign', { description: normaliseError(assignError).message });
    }
  }

  async function onMessage() {
    if (message.trim().length === 0) return;
    try {
      await actions.message.mutateAsync({ id, body: message.trim() });
      setMessage('');
    } catch (messageError) {
      toast.error('Could not send', { description: normaliseError(messageError).message });
    }
  }

  async function onRule() {
    if (rationale.trim().length < 3) {
      toast.error('A rationale is required');
      return;
    }
    try {
      await actions.rule.mutateAsync({
        id,
        input: {
          ruling,
          freelancerPct: ruling === 'PARTIAL_SPLIT' ? freelancerPct : undefined,
          rationale: rationale.trim(),
        },
      });
      toast.success('Ruling issued');
    } catch (ruleError) {
      toast.error('Could not rule', { description: normaliseError(ruleError).message });
    } finally {
      setConfirmRuling(false);
    }
  }

  function applySuggestion() {
    setRuling(dispute!.suggestion.ruling);
    if (dispute!.suggestion.ruling === 'PARTIAL_SPLIT') {
      setPct(String(dispute!.suggestion.freelancerPct));
    }
    setRationale(dispute!.suggestion.rationale);
  }

  return (
    <div className="space-y-6">
      <BackLink />

      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight text-ink">{dispute.contractTitle}</h1>
            <DisputeStatusBadge status={dispute.status} label={dispute.statusLabel} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {dispute.milestoneTitle} · {money(dispute.amount, dispute.currency)} ·{' '}
            {dispute.reasonLabel} · filed by {dispute.filedByName} ({dispute.filedByRole})
          </p>
        </div>
        <Link
          href={`/contracts/${dispute.contractId}`}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:opacity-80"
        >
          View deal →
        </Link>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {/* Left: case detail */}
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Claim</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Payer" value={dispute.payerName} />
                <Field label="Payee" value={dispute.payeeName} />
                <Field label="Amount in escrow" value={money(dispute.amount, dispute.currency)} />
                <Field label="Escrow status" value={dispute.escrowStatus ?? '-'} />
              </div>
              <div>
                <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
                  Description
                </p>
                <p className="mt-1 text-xs text-ink">{dispute.description}</p>
              </div>
            </CardContent>
          </Card>

          {/* Evidence & messages - unified feed */}
          <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <p className="mb-4 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
              Evidence &amp; messages
            </p>
            {feed.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
            ) : (
              <div className="divide-y divide-hairline">
                {feed.map((item) => (
                  <div key={item.id} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                    <span
                      className={cn(
                        'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                        avatarColor(item.by),
                      )}
                    >
                      {initials(item.by)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink">{item.by}</span>
                        <RoleBadge role={item.role} />
                        <span className="text-xs text-muted-foreground">
                          {formatDateTime(item.at)}
                        </span>
                        {item.files > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <FileText className="size-3.5" /> {item.files}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-slate-700">{item.body}</p>
                      {item.images.length > 0 ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.images.map((src, index) => (
                            <a key={index} href={src} target="_blank" rel="noreferrer">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={src}
                                alt="Evidence"
                                className="size-20 rounded-lg border border-hairline object-cover transition-opacity hover:opacity-90"
                              />
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canResolve && dispute.open ? (
              <div className="mt-4 flex gap-2 border-t border-hairline pt-4">
                <input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Message the parties…"
                  className="h-10 flex-1 rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
                />
                <button
                  type="button"
                  onClick={onMessage}
                  disabled={busy || message.trim().length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  <Send className="size-4" /> Send
                </button>
              </div>
            ) : null}
          </div>

          {/* Timeline */}
          <Card>
            <CardHeader>
              <CardTitle>Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2">
                {dispute.timeline.map((event, index) => (
                  <li key={index} className="flex gap-2 text-sm">
                    <span className="text-muted-foreground">-</span>
                    <span className="flex-1">
                      <span className="text-ink">{event.event.replace(/_/g, ' ')}</span>{' '}
                      <span className="text-muted-foreground">- {formatDateTime(event.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        {/* Right: mediation controls */}
        <div className="space-y-5 lg:col-span-1">
          {/* Mediator */}
          <SectionCard label="Mediator">
            {dispute.mediator ? (
              <p className="text-sm text-ink">
                Assigned to <span className="font-semibold">{dispute.mediator.name}</span>
              </p>
            ) : (
              <p className="text-sm text-amber-700">No mediator assigned.</p>
            )}
            {canAssign && dispute.open ? (
              <div className="mt-3 space-y-2">
                <select
                  value={mediatorId}
                  onChange={(event) => setMediatorId(event.target.value)}
                  className="h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
                >
                  <option value="">Select a mediator…</option>
                  {(mediators ?? []).map((mediator) => (
                    <option key={mediator.id} value={mediator.id}>
                      {mediator.fullName} · {mediator.role}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={onAssign}
                    disabled={busy || !mediatorId}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-field px-3 py-2 text-sm font-medium text-ink transition hover:bg-muted disabled:opacity-50"
                  >
                    <UserPlus className="size-4" /> {dispute.mediator ? 'Reassign' : 'Assign'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmEscalate(true)}
                    disabled={busy}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-negative/40 px-3 py-2 text-sm font-medium text-negative transition hover:bg-negative-bg/50 disabled:opacity-50"
                  >
                    <ArrowUpRight className="size-4" /> Escalate
                  </button>
                </div>
              </div>
            ) : null}
          </SectionCard>

          {/* AI recommendation */}
          <div className="rounded-lg border border-brand-200 bg-brand-50/50 p-5">
            <div className="mb-2 flex items-center gap-2">
              <Sparkles className="size-4 text-brand-600" />
              <p className="text-[11px] font-semibold tracking-wider text-brand-700 uppercase">
                {dispute.suggestion.source === 'model' ? 'AI recommendation' : 'Suggested resolution'}
              </p>
              {dispute.suggestion.source === 'model' ? (
                <span className="rounded-full bg-brand-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
                  AI
                </span>
              ) : null}
            </div>
            <p className="text-sm font-semibold text-ink">
              {rulingLabel(dispute.suggestion.ruling)}
              {dispute.suggestion.ruling === 'PARTIAL_SPLIT'
                ? ` · ${dispute.suggestion.freelancerPct}% to freelancer`
                : ''}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{dispute.suggestion.rationale}</p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-brand-100">
                <div
                  className="h-full rounded-full bg-brand-600"
                  style={{ width: `${Math.round(dispute.suggestion.confidence * 100)}%` }}
                />
              </div>
              <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
                {Math.round(dispute.suggestion.confidence * 100)}% confidence
              </span>
            </div>
            {canResolve && dispute.open ? (
              <button
                type="button"
                onClick={applySuggestion}
                className="mt-3 text-sm font-medium text-brand-600 hover:opacity-80"
              >
                Apply this recommendation →
              </button>
            ) : null}
          </div>

          {/* Ruling */}
          <SectionCard label="Binding ruling">
            {dispute.ruling ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-ink">
                  {rulingLabel(dispute.ruling.ruling)}
                  {dispute.ruling.ruling === 'PARTIAL_SPLIT'
                    ? ` · ${dispute.ruling.freelancerPct}/${dispute.ruling.clientPct}`
                    : ''}
                </p>
                <p className="text-sm text-ink">{dispute.ruling.rationale}</p>
                <p className="text-xs text-muted-foreground">
                  Ruled {formatDateTime(dispute.ruling.ruledAt)}
                </p>
              </div>
            ) : !canResolve ? (
              <p className="text-sm text-muted-foreground">
                You don’t have permission to rule on disputes.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  {(['FULL_RELEASE', 'FULL_REFUND', 'PARTIAL_SPLIT'] as RulingType[]).map((option) => (
                    <label
                      key={option}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm',
                        ruling === option
                          ? 'border-brand-400 bg-brand-50/50 text-ink'
                          : 'border-hairline text-muted-foreground hover:bg-muted/40',
                      )}
                    >
                      <input
                        type="radio"
                        name="ruling"
                        checked={ruling === option}
                        onChange={() => setRuling(option)}
                        className="accent-brand-600"
                      />
                      {rulingLabel(option)}
                    </label>
                  ))}
                </div>

                {ruling === 'PARTIAL_SPLIT' ? (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">
                      Freelancer share (%)
                    </label>
                    <input
                      value={pct}
                      onChange={(event) => setPct(event.target.value)}
                      inputMode="numeric"
                      className="mt-1 h-10 w-full rounded-lg border border-field bg-white px-3 text-sm text-ink outline-none transition focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
                    />
                    <p className="mt-1 text-xs text-muted-foreground">
                      {money(payeeShare, dispute.currency)} to freelancer ·{' '}
                      {money(payerShare, dispute.currency)} to client
                    </p>
                  </div>
                ) : null}

                <div>
                  <label className="text-xs font-medium text-muted-foreground">Rationale</label>
                  <textarea
                    value={rationale}
                    onChange={(event) => setRationale(event.target.value)}
                    rows={3}
                    placeholder="Explain the basis for this binding ruling…"
                    className="mt-1 w-full rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => setConfirmRuling(true)}
                  disabled={busy || rationale.trim().length < 3 || !dispute.open}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
                >
                  <Gavel className="size-4" /> Issue binding ruling
                </button>
                <p className="text-xs text-muted-foreground">
                  This moves the escrowed funds and cannot be undone.
                </p>
              </div>
            )}
          </SectionCard>
        </div>
      </div>

      <ConfirmDialog
        open={confirmRuling}
        onOpenChange={setConfirmRuling}
        title="Issue this binding ruling?"
        description="This disposes the escrowed funds and closes the dispute."
        confirmLabel="Yes, Issue ruling"
        tone="danger"
        icon={Gavel}
        confirmIcon={Gavel}
        subject={{ label: 'Ruling', value: rulingLabel(ruling) }}
        consequences={[
          freelancerPct > 0 ? `${money(payeeShare, dispute.currency)} released to ${dispute.payeeName}` : '',
          payerShare > 0 ? `${money(payerShare, dispute.currency)} refunded to ${dispute.payerName}` : '',
          'The dispute is closed and recorded in the audit log',
        ].filter(Boolean)}
        onConfirm={onRule}
      />

      <ConfirmDialog
        open={confirmEscalate}
        onOpenChange={setConfirmEscalate}
        title="Escalate this dispute?"
        description="Flags the case for senior arbitration."
        confirmLabel="Yes, Escalate"
        tone="warning"
        icon={ArrowUpRight}
        confirmIcon={ArrowUpRight}
        input={{ label: 'Note (optional)', placeholder: 'Why is this being escalated…', required: false }}
        onConfirm={async (value) => {
          try {
            await actions.escalate.mutateAsync({ id, note: value || undefined });
            toast.success('Dispute escalated');
          } catch (escalateError) {
            toast.error('Could not escalate', { description: normaliseError(escalateError).message });
          } finally {
            setConfirmEscalate(false);
          }
        }}
      />
    </div>
  );
}

const ROLE_STYLE: Record<PartyRole, string> = {
  payer: STATUS_TONE.info,
  payee: STATUS_TONE.positive,
  mediator: STATUS_TONE.neutral,
};
const ROLE_LABEL: Record<PartyRole, string> = {
  payer: 'Payer',
  payee: 'Payee',
  mediator: 'Mediator',
};

function RoleBadge({ role }: { role: PartyRole }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
        ROLE_STYLE[role],
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-ink">{value}</p>
    </div>
  );
}

function SectionCard({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-hairline bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <p className="mb-3 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        {label}
      </p>
      {children}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/disputes"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
    >
      <ArrowLeft className="size-4" /> Disputes
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
        You don’t have permission to view this dispute.
      </p>
    </div>
  );
}
