'use client';

import { useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Check,
  FileText,
  Loader2,
  Lock,
  Search,
  User as UserIcon,
  X,
} from 'lucide-react';

import { AuthedImage } from '@/components/authed-image';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { normaliseError } from '@/lib/api/client';
import { usePermission } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils';
import { avatarColor, initials } from '@/lib/avatar';
import {
  useApproveKyc,
  useEscalateKyc,
  useKycDetail,
  useRejectKyc,
  useRequestDocsKyc,
} from '@/features/kyc/hooks';
import { KycStatusBadge, idTypeLabel } from '@/features/kyc/kyc-ui';
import type { KycReviewItem } from '@/features/kyc/types';

const DOCUMENT_CARDS: { type: string; title: string; caption: string; selfie?: boolean }[] = [
  { type: 'ID_FRONT', title: 'ID - Front', caption: 'Document image' },
  { type: 'ID_BACK', title: 'ID - Back', caption: 'Document image' },
  { type: 'SELFIE', title: 'Selfie - Liveness', caption: 'Selfie capture', selfie: true },
];

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

function formatWhen(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  const now = new Date();
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const sameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (sameDay) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return `${date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}, ${time}`;
}

export default function KycReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const canView = usePermission('kyc.view');
  const canApprove = usePermission('kyc.approve');
  const canReject = usePermission('kyc.reject');
  const canRequestDocs = usePermission('kyc.request_docs');
  const canEscalate = usePermission('kyc.escalate');

  const { data: item, isLoading, isError, error } = useKycDetail(id);
  const approve = useApproveKyc();
  const reject = useRejectKyc();
  const requestDocs = useRequestDocsKyc();
  const escalate = useEscalateKyc();

  const [rejectReason, setRejectReason] = useState('');
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [zoomedDocument, setZoomedDocument] = useState<{ fileId: string; title: string } | null>(
    null,
  );

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

  async function onApprove() {
    if (!item) return;
    try {
      await approve.mutateAsync(item.id);
      toast.success('Submission approved');
    } catch (approveError) {
      toast.error('Could not approve', { description: normaliseError(approveError).message });
    }
  }

  async function onReject() {
    if (!item || rejectReason.trim().length < 3) return;
    try {
      await reject.mutateAsync({ id: item.id, reason: rejectReason.trim() });
      toast.success('Submission rejected');
      setRejectReason('');
    } catch (rejectError) {
      toast.error('Could not reject', { description: normaliseError(rejectError).message });
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
  if (isError || !item) {
    return (
      <div className="space-y-4">
        <BackLink />
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          {isError ? normaliseError(error).message : 'Submission not found.'}
        </div>
      </div>
    );
  }

  const applicantName = item.user?.fullName ?? 'Unknown applicant';
  const isDecided = item.status === 'APPROVED' || item.status === 'REJECTED';
  const documentsByType = new Map(item.documents.map((document) => [document.type, document]));
  const openFlags = item.reviewItems.filter((flag) => !flag.resolved);

  return (
    <div className="space-y-6">
      {/* Module header (mirrors the queue) */}
      <div>
        <p className="text-xs font-semibold tracking-wider text-brand-600 uppercase">BiZik Admin</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-ink">KYC review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Identity submissions awaiting a decision.
        </p>
      </div>

      <BackLink />

      {/* Applicant header + secondary actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-full text-sm font-bold',
              avatarColor(applicantName),
            )}
          >
            {initials(applicantName)}
          </span>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-ink">{applicantName}</h2>
              <KycStatusBadge status={item.status} label={item.statusLabel} />
            </div>
            <p className="text-sm text-muted-foreground">
              {[
                item.user?.email,
                item.user?.country,
                idTypeLabel(item.idType),
                `submitted ${formatWhen(item.submittedAt)}`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {canRequestDocs && !isDecided ? (
            <SecondaryButton
              icon={FileText}
              label="Request documents"
              onClick={() =>
                setPendingAction({
                  title: 'Request more documents?',
                  description: 'Ask the applicant for clearer or additional documents.',
                  confirmLabel: 'Send request',
                  icon: FileText,
                  confirmIcon: FileText,
                  subject: { label: 'Applicant', value: applicantName },
                  input: {
                    label: 'What do you need?',
                    placeholder: 'e.g. A clearer photo of the ID front…',
                    required: true,
                    minLength: 3,
                  },
                  successMessage: 'Document request sent',
                  run: (value) => requestDocs.mutateAsync({ id: item.id, reason: value }),
                })
              }
            />
          ) : null}
          {canEscalate ? (
            <SecondaryButton
              icon={AlertTriangle}
              label="Escalate"
              onClick={() =>
                setPendingAction({
                  title: 'Escalate to a Compliance Officer?',
                  description: 'Flags this case for senior compliance review.',
                  confirmLabel: 'Yes, Escalate',
                  tone: 'warning',
                  icon: AlertTriangle,
                  confirmIcon: ArrowUpRight,
                  subject: { label: 'Applicant', value: applicantName },
                  consequences: [
                    'The case is marked as under review',
                    'A review flag is added for the Compliance team',
                  ],
                  successMessage: 'Case escalated',
                  run: () => escalate.mutateAsync(item.id),
                })
              }
            />
          ) : null}
        </div>
      </div>

      {/* Document previews */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {DOCUMENT_CARDS.map((card) => (
          <DocumentCard
            key={card.type}
            card={card}
            fileId={documentsByType.get(card.type)?.fileId ?? null}
            onZoom={setZoomedDocument}
          />
        ))}
      </div>

      {/* Scores + flags (left) and decision (right) */}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <ScoresCard item={item} />
          <ScreeningCard flags={openFlags} item={item} />
        </div>

        <div className="lg:col-span-1">
          <SectionCard label="Decision">
            {isDecided ? (
              <DecidedNotice item={item} />
            ) : (
              <div className="space-y-4">
                {canApprove ? (
                  <button
                    type="button"
                    onClick={onApprove}
                    disabled={approve.isPending}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                  >
                    {approve.isPending ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    Approve - unlock tier {item.targetTier}
                  </button>
                ) : null}

                {canReject ? (
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-muted-foreground">
                      Rejection reason (required to reject)
                    </label>
                    <textarea
                      value={rejectReason}
                      onChange={(event) => setRejectReason(event.target.value)}
                      rows={3}
                      placeholder="e.g. Document photo unreadable; face match below threshold…"
                      className="w-full rounded-lg border border-field bg-white px-3 py-2 text-sm text-ink outline-none transition placeholder:text-muted-foreground/70 focus:border-brand-400 focus:ring-4 focus:ring-brand-500/10"
                    />
                    <button
                      type="button"
                      onClick={onReject}
                      disabled={reject.isPending || rejectReason.trim().length < 3}
                      className="flex w-full items-center justify-center gap-2 rounded-lg border border-negative/40 px-4 py-2.5 text-sm font-semibold text-negative transition hover:bg-negative-bg/50 disabled:opacity-50"
                    >
                      {reject.isPending ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <X className="size-4" />
                      )}
                      Reject submission
                    </button>
                  </div>
                ) : null}

                {!canApprove && !canReject ? (
                  <p className="text-sm text-muted-foreground">
                    You have view-only access to this submission.
                  </p>
                ) : null}

                <p className="text-xs text-muted-foreground">
                  Decisions are recorded in the audit log with your operator ID. The applicant is
                  notified either way.
                </p>
              </div>
            )}
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

      {zoomedDocument ? (
        <DocumentLightbox document={zoomedDocument} onClose={() => setZoomedDocument(null)} />
      ) : null}
    </div>
  );
}

/** Full-screen viewer for a KYC document, fetched through the authed proxy. */
function DocumentLightbox({
  document,
  onClose,
}: {
  document: { fileId: string; title: string };
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/85 p-4 backdrop-blur-sm sm:p-8"
      onClick={onClose}
    >
      <div className="flex items-center justify-between pb-3 text-white">
        <span className="text-sm font-semibold">{document.title}</span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 transition hover:bg-white/15"
          aria-label="Close"
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center" onClick={onClose}>
        <AuthedImage
          fileId={document.fileId}
          alt={document.title}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
      </div>
    </div>
  );
}

function ScoresCard({ item }: { item: KycReviewItem }) {
  // With no provider connected these numbers are generated from the ID number
  // and never look at the images - a photo of a laptop scores like a passport.
  // Showing them as confident green bars invites an operator to trust a check
  // that never happened, so say plainly what they are and drain the colour.
  const simulated = item.providerSimulated !== false;
  const findings = item.providerChecks ?? [];

  if (simulated) {
    return (
      <SectionCard label="Provider scores - not a real check">
        <div className="mb-4 flex gap-2.5 rounded-lg border border-amber-300 bg-amber-50 p-3">
          <AlertTriangle className="size-4 shrink-0 text-amber-600" />
          <p className="text-xs leading-relaxed text-amber-900">
            <span className="font-semibold">No identity provider is connected.</span> These scores are
            placeholders generated from the ID number - nothing has examined the documents. Decide from
            the images above, not from these figures.
          </p>
        </div>
        <div className="space-y-4 opacity-60">
          <ScoreBar label="Liveness" value={item.selfieScore} muted />
          <ScoreBar label="Face match" value={item.matchScore} muted />
          <ScoreBar label="Document confidence" value={item.documentScore} muted />
        </div>
      </SectionCard>
    );
  }

  const advice = item.providerAdvice ?? null;
  const adviceTone =
    advice?.verdict === 'reject'
      ? 'border-negative-bg bg-negative-bg-soft text-negative'
      : advice?.verdict === 'approve'
        ? 'border-positive-bg bg-positive-bg text-positive-text'
        : 'border-hairline bg-muted text-muted-foreground';

  return (
    <SectionCard label="Image analysis">
      {advice ? (
        <div className={cn('mb-5 rounded-lg border p-3', adviceTone)}>
          <p className="text-xs font-bold uppercase tracking-wide">
            {advice.verdict === 'reject'
              ? 'Suggested: reject'
              : advice.verdict === 'approve'
                ? 'Suggested: approve'
                : 'Needs a closer look'}
          </p>
          <p className="mt-1 text-xs leading-relaxed">{advice.reason}</p>
          <p className="mt-1.5 text-[11px] opacity-80">
            A suggestion from the measurements below - the decision is yours.
          </p>
        </div>
      ) : null}

      <div className="space-y-4">
        {/* Named for what each one measures. "Liveness" would overstate it:
            proving a live human needs an active challenge, which this is not. */}
        <ScoreBar label="Face match (ID vs selfie)" value={item.matchScore} />
        <ScoreBar label="Document quality" value={item.documentScore} />
        <ScoreBar label="Selfie checks" value={item.selfieScore} />
      </div>

      {findings.length > 0 ? (
        <ul className="mt-5 space-y-2 border-t border-hairline pt-4">
          {findings.map((finding) => (
            <li key={finding.id} className="flex gap-2.5 text-xs leading-relaxed">
              {finding.passed ? (
                <Check className="mt-0.5 size-3.5 shrink-0 text-positive" />
              ) : (
                <X className="mt-0.5 size-3.5 shrink-0 text-negative" />
              )}
              <span className={finding.passed ? 'text-muted-foreground' : 'text-ink'}>
                <span className="font-semibold">{finding.label}:</span> {finding.detail}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="mt-4 text-xs text-muted-foreground">
        Measured from the submitted images. This checks whether the documents are
        readable and whether the faces match - it does not detect forgery, and it is
        not certified liveness. The decision is yours.
      </p>
    </SectionCard>
  );
}

function ScoreBar({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: number | null;
  /** Placeholder score: render it grey so it reads as data, not as a verdict. */
  muted?: boolean;
}) {
  const pct = value == null ? null : Math.round(value * 100);
  const barColor =
    pct == null || muted
      ? 'bg-muted-foreground/40'
      : pct >= 80
        ? 'bg-positive'
        : pct >= 65
          ? 'bg-amber-500'
          : 'bg-negative';
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink">{label}</span>
        <span className="font-semibold text-ink tabular-nums">{pct == null ? '-' : `${pct} / 100`}</span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className={cn('h-full rounded-full', barColor)} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  );
}

function ScreeningCard({ flags, item }: { flags: KycReviewItem['reviewItems']; item: KycReviewItem }) {
  const history: { text: string; when: string }[] = [
    { text: 'Submitted via mobile app', when: item.submittedAt },
    ...item.reviewItems.map((flag) => ({ text: flag.reason, when: flag.createdAt })),
  ];
  if (item.reviewedAt) {
    history.push({ text: `Decision recorded (${item.statusLabel})`, when: item.reviewedAt });
  }

  return (
    <SectionCard label="Screening flags">
      {flags.length === 0 ? (
        <p className="text-sm text-muted-foreground">No screening flags on this submission.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {flags.map((flag, index) => (
            <span
              key={`${flag.reason}-${index}`}
              className="inline-flex items-center rounded-md bg-negative-bg px-2 py-0.5 text-[11px] font-semibold tracking-wide text-negative uppercase"
            >
              {shortFlag(flag.reason)}
            </span>
          ))}
        </div>
      )}

      <p className="mt-5 mb-2 text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
        Review history
      </p>
      <ul className="space-y-1.5">
        {history.map((entry, index) => (
          <li key={index} className="flex gap-2 text-sm text-ink">
            <span className="text-muted-foreground">-</span>
            <span className="flex-1">
              {entry.text}{' '}
              <span className="text-muted-foreground">- {formatWhen(entry.when)}</span>
            </span>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** Short uppercase tag derived from a flag reason (e.g. "PEP MATCH"). */
function shortFlag(reason: string): string {
  const lower = reason.toLowerCase();
  if (lower.includes('pep')) return 'PEP match';
  if (lower.includes('sanction')) return 'Sanctions';
  if (lower.includes('escalat')) return 'Escalated';
  if (lower.includes('confidence') || lower.includes('threshold')) return 'Low score';
  return reason.split(' ').slice(0, 2).join(' ');
}

function DecidedNotice({ item }: { item: KycReviewItem }) {
  const approved = item.status === 'APPROVED';
  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium',
          approved ? 'bg-positive-bg text-positive' : 'bg-negative-bg text-negative',
        )}
      >
        {approved ? <Check className="size-4" /> : <X className="size-4" />}
        {approved ? 'Submission approved' : 'Submission rejected'}
      </div>
      {item.rejectionReason ? (
        <p className="text-sm text-ink">
          <span className="font-semibold">Reason: </span>
          {item.rejectionReason}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        This decision was recorded in the audit log. Reopen the queue to review other submissions.
      </p>
    </div>
  );
}

function DocumentCard({
  card,
  fileId,
  onZoom,
}: {
  card: { type: string; title: string; caption: string; selfie?: boolean };
  fileId: string | null;
  onZoom: (document: { fileId: string; title: string }) => void;
}) {
  const PlaceholderIcon = card.selfie ? UserIcon : FileText;
  const present = fileId !== null;
  return (
    <div className="overflow-hidden rounded-lg border border-hairline bg-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="flex items-center justify-between px-4 py-2.5">
        <span className="text-[11px] font-semibold tracking-wider text-muted-foreground uppercase">
          {card.title}
        </span>
        <button
          type="button"
          disabled={!present}
          onClick={() => present && onZoom({ fileId, title: card.title })}
          className="text-muted-foreground transition hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title="Zoom"
          aria-label="Zoom"
        >
          <Search className="size-4" />
        </button>
      </div>
      {present ? (
        <button
          type="button"
          onClick={() => onZoom({ fileId, title: card.title })}
          className="group block w-full border-t border-hairline"
          title="Click to enlarge"
        >
          <AuthedImage
            fileId={fileId}
            alt={card.title}
            className="aspect-4/3 w-full bg-muted/60 object-cover transition group-hover:opacity-90"
          />
        </button>
      ) : (
        <div className="flex aspect-4/3 flex-col items-center justify-center gap-2 border-t border-hairline bg-muted/60 text-muted-foreground">
          <PlaceholderIcon className="size-6" />
          <span className="text-xs">Not provided</span>
        </div>
      )}
    </div>
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

function SecondaryButton({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-field bg-white px-3 py-2 text-sm font-medium text-ink transition hover:bg-muted"
    >
      <Icon className="size-4 text-muted-foreground" />
      {label}
    </button>
  );
}

function BackLink() {
  return (
    <Link
      href="/kyc"
      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:opacity-80"
    >
      <ArrowLeft className="size-4" /> Review queue
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
        You don’t have permission to view this submission.
      </p>
    </div>
  );
}
