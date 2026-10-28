'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Link2 as LinkIcon,
  Loader2,
  Lock,
  MoreVertical,
  Plus,
  BellRing,
  FileDown,
  RotateCcw,
  ShieldCheck,
  XCircle,
  Share2,
  type LucideIcon,
} from 'lucide-react';

import { AVATAR_TONE, DEAL_STATUS_TONE } from '@/components/deals/deal-meta';
import { ReleaseModal, type ReleaseModalData } from '@/components/deals/release-modal';
import { RevisionModal, type RevisionModalData } from '@/components/deals/revision-modal';
import { SubmitWorkModal, type SubmitWorkModalData } from '@/components/deals/submit-work-modal';
import { StatusPill, type StatusTone } from '@/components/ui/status-pill';
import { api, normaliseError } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { contractsApi } from '@/lib/api/contracts.api';
import type { Contract, ContractMilestone } from '@/lib/api/contracts.api';
import {
  useAcceptDeal,
  useCancelDeal,
  useCancelMilestone,
  useCompleteProject,
  useContract,
  useDeclineDeal,
  useDisputeMilestone,
  useReleaseMilestone,
  useRemindCounterparty,
  useRequestRevision,
  useSubmitWork,
} from '@/lib/hooks/use-contract';
import type { AvatarTone, DealStatus } from '@/lib/demo/deals';
import { approxMoney, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const M_GRID =
  'grid grid-cols-[minmax(160px,1.7fr)_minmax(90px,0.85fr)_minmax(90px,0.9fr)_minmax(90px,0.8fr)] items-center gap-3';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** ISO / "YYYY-MM-DD" → "12 Jun". */
function shortDate(iso?: string): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate().toString().padStart(2, '0')} ${MONTHS[date.getUTCMonth()]}`;
}

/** ISO → "29 Aug 2026". */
function longDate(iso?: string): string {
  if (!iso) return '-';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getUTCDate().toString().padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** Relative auto-release window, e.g. "2 days" / "today". */
function autoReleaseLabel(iso?: string | null): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return undefined;
  const days = Math.ceil((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days <= 0) return 'today';
  return days === 1 ? '1 day' : `${days} days`;
}

const STATUS_MAP: Record<Contract['status'], DealStatus> = {
  Pending: 'pending',
  Draft: 'pending',
  'Awaiting funding': 'awaiting_funding',
  'In progress': 'in_progress',
  'In review': 'in_review',
  Disputed: 'disputed',
  Completed: 'completed',
  Cancelled: 'cancelled',
};

type MStatusKey =
  | 'released'
  | 'submitted'
  | 'pending'
  | 'funded'
  | 'approved'
  | 'in_progress'
  | 'disputed'
  | 'cancelled';

const MS_LABEL_TO_KEY: Record<string, MStatusKey> = {
  Released: 'released',
  Submitted: 'submitted',
  Pending: 'pending',
  Funded: 'funded',
  Approved: 'approved',
  'In progress': 'in_progress',
  Disputed: 'disputed',
  Cancelled: 'cancelled',
};

const MS_TONE: Record<MStatusKey, StatusTone> = {
  released: 'positive',
  approved: 'positive',
  funded: 'positive',
  submitted: 'cyan',
  pending: 'neutral',
  in_progress: 'brand',
  disputed: 'negative',
  cancelled: 'neutral',
};

const MS_LABEL_TO_RAW: Record<string, string> = {
  Pending: 'PENDING',
  Funded: 'FUNDED',
  'In progress': 'ACTIVE',
  Submitted: 'SUBMITTED',
  Approved: 'APPROVED',
  Released: 'RELEASED',
  Disputed: 'DISPUTED',
  Cancelled: 'CANCELLED',
};

const AVATAR_TONES: AvatarTone[] = ['brand', 'warning', 'positive', 'neutral'];

function toneFor(name: string): AvatarTone {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = (hash * 31 + name.charCodeAt(index)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

type MilestoneActionKey = 'fund' | 'submit' | 'approve' | 'revise' | 'dispute';
interface MilestoneAction {
  action: MilestoneActionKey;
  kind: 'primary' | 'secondary';
}

/** The next steps available on a milestone, given the viewer's role. Mirrors mobile `milestoneActions`. */
function milestoneActions(raw: string, viewerRole: Contract['viewerRole'], fundable: boolean): MilestoneAction[] {
  if (raw === 'SUBMITTED') {
    return viewerRole === 'client'
      ? [
          { action: 'approve', kind: 'primary' },
          { action: 'revise', kind: 'secondary' },
          { action: 'dispute', kind: 'secondary' },
        ]
      : [{ action: 'dispute', kind: 'secondary' }];
  }
  if ((raw === 'FUNDED' || raw === 'ACTIVE') && viewerRole === 'freelancer') {
    return [{ action: 'submit', kind: 'primary' }];
  }
  if (raw === 'PENDING' && viewerRole === 'client' && fundable) {
    return [{ action: 'fund', kind: 'primary' }];
  }
  return [];
}

// ---- View-model -----------------------------------------------------------

interface VMParty {
  name: string;
  initials: string;
  tone: AvatarTone;
  roleKey: string;
  currency: string;
  isPayee?: boolean;
  location?: string;
}

interface VMMilestone {
  id: string;
  index: number;
  title: string;
  amount: number;
  currency: string;
  deliveryDate: string;
  statusKey: MStatusKey;
  tone: StatusTone;
  raw: string;
  current: boolean;
  delivery?: { note: string; images: string[]; revision: string };
  /** The payer's latest revision feedback (what the payee must fix). */
  revisionNote?: string;
  autoReleaseIn?: string;
  actions: MilestoneAction[];
  /** The viewer created this deal and this milestone is still unfunded. */
  canCancel: boolean;
}

interface DealVM {
  id: string;
  title: string;
  status: DealStatus;
  total: number;
  currency: string;
  approx?: string;
  payer: VMParty;
  payee: VMParty;
  counterparty: VMParty;
  isPayer: boolean;
  viewerRole: Contract['viewerRole'];
  accepted: boolean;
  isCreator: boolean;
  signedBoth: boolean;
  scope: string;
  milestones: VMMilestone[];
  autoReleaseIn?: string;
  releaseAmount: number;
  releaseApprox?: string;
  releaseMilestoneIndex: number;
  releaseMilestoneId?: string;
  financials: { released: number; inEscrow: number; refunded: number; unfunded: number; requiredDate: string; fee: number };
  createdOn?: string;
  milestonesDone: number;
  allReleased: boolean;
  closed: boolean;
  canComplete: boolean;
  pendingInviteRecipient: boolean;
  /** The viewer created this deal and nothing is funded - they may cancel it. */
  canCancel: boolean;
}

function mapContract(contract: Contract): DealVM {
  const isPayer = contract.viewerRole === 'client';
  const status = STATUS_MAP[contract.status] ?? 'pending';

  const payer: VMParty = {
    name: contract.clientName,
    initials: initialsOf(contract.clientName),
    tone: toneFor(contract.clientName),
    roleKey: 'deals.detail.whoPays',
    currency: contract.currency,
    location: isPayer ? undefined : contract.counterpartyCountry || undefined,
  };
  const payee: VMParty = {
    name: contract.freelancerName,
    initials: initialsOf(contract.freelancerName),
    tone: toneFor(contract.freelancerName),
    roleKey: 'deals.detail.whoGetsPaid',
    currency: contract.currency,
    isPayee: true,
    location: isPayer ? contract.counterpartyCountry || undefined : undefined,
  };

  const rawOf = (milestone: ContractMilestone) =>
    milestone.rawStatus ?? MS_LABEL_TO_RAW[milestone.status] ?? 'PENDING';

  // Each party sees every amount in THEIR OWN home currency. The backend gives
  // the viewer's currency + an FX multiplier (1 when it already equals the deal
  // currency), so we convert each figure and keep the original deal currency
  // only as a small "≈" reference on the headline total.
  const fxToViewer = contract.fxToViewer ?? 1;
  const displayCurrency = contract.viewerCurrency ?? contract.currency;
  const dealCurrency = contract.currency;
  const showOriginal = displayCurrency !== dealCurrency;
  const toViewerAmount = (amount: number) => amount * fxToViewer;

  const submittedIndex = contract.milestones.findIndex((m) => rawOf(m) === 'SUBMITTED');
  const activeIndex =
    submittedIndex >= 0
      ? submittedIndex
      : contract.milestones.findIndex((m) => ['FUNDED', 'ACTIVE'].includes(rawOf(m)));

  const milestones: VMMilestone[] = contract.milestones.map((milestone, index) => {
    const raw = rawOf(milestone);
    const statusKey = MS_LABEL_TO_KEY[milestone.status] ?? 'pending';
    const hasDelivery = Boolean(milestone.deliveryNote) || (milestone.deliveryImages?.length ?? 0) > 0;
    return {
      id: milestone.id,
      index: index + 1,
      title: milestone.title,
      amount: toViewerAmount(milestone.amount),
      currency: displayCurrency,
      deliveryDate: shortDate(milestone.dueDate),
      statusKey,
      tone: MS_TONE[statusKey],
      raw,
      current: index === activeIndex,
      revisionNote: milestone.revisionNote ?? undefined,
      delivery: hasDelivery
        ? {
            note: milestone.deliveryNote ?? '',
            images: milestone.deliveryImages ?? [],
            revision: `${(milestone.revisionCount ?? 0) + 1}/${milestone.maxRevisions ?? 2}`,
          }
        : undefined,
      autoReleaseIn: raw === 'SUBMITTED' ? autoReleaseLabel(milestone.autoReleaseAt) : undefined,
      actions: milestoneActions(raw, contract.viewerRole, contract.accepted ?? false),
      canCancel: milestone.canCancel ?? false,
    };
  });

  const submitted = submittedIndex >= 0 ? contract.milestones[submittedIndex] : undefined;

  const escrow = contract.escrow;
  const releasedRaw =
    escrow?.released ??
    contract.milestones
      .filter((milestone) => rawOf(milestone) === 'RELEASED')
      .reduce((runningTotal, milestone) => runningTotal + milestone.amount, 0);
  const inEscrowRaw = escrow?.held ?? 0;
  const refundedRaw = escrow?.refunded ?? 0;
  const unfundedRaw =
    escrow?.unfunded ??
    contract.milestones
      .filter((milestone) => rawOf(milestone) === 'PENDING')
      .reduce((runningTotal, milestone) => runningTotal + milestone.amount, 0);
  const feeRaw = contract.fees ? contract.amount * contract.fees.clientServicePct : 0;
  const lastDue = contract.milestones[contract.milestones.length - 1]?.dueDate;
  const milestonesDone = contract.milestones.filter((milestone) => rawOf(milestone) === 'RELEASED').length;
  const liveMilestones = contract.milestones.filter((milestone) => rawOf(milestone) !== 'CANCELLED');

  const closed = contract.rawStatus === 'COMPLETED' || contract.rawStatus === 'CANCELLED';
  const allReleased =
    liveMilestones.length > 0 && liveMilestones.every((m) => rawOf(m) === 'RELEASED');
  const pendingInviteRecipient = contract.status === 'Pending' && !(contract.isCreator ?? false);

  return {
    id: contract.id,
    title: contract.title,
    status,
    total: toViewerAmount(contract.amount),
    currency: displayCurrency,
    approx: showOriginal ? approxMoney(contract.amount, dealCurrency) : undefined,
    payer,
    payee,
    counterparty: isPayer ? payee : payer,
    isPayer,
    viewerRole: contract.viewerRole,
    accepted: contract.accepted ?? false,
    isCreator: contract.isCreator ?? false,
    signedBoth: Boolean(contract.signedByClient && contract.signedByFreelancer),
    scope: contract.description ?? '',
    milestones,
    autoReleaseIn: submitted ? autoReleaseLabel(submitted.autoReleaseAt) : undefined,
    releaseAmount: toViewerAmount(submitted?.amount ?? contract.amount),
    releaseApprox: showOriginal && submitted ? approxMoney(submitted.amount, dealCurrency) : undefined,
    releaseMilestoneIndex: submittedIndex >= 0 ? submittedIndex + 1 : 1,
    releaseMilestoneId: submitted?.id,
    financials: {
      released: toViewerAmount(releasedRaw),
      inEscrow: toViewerAmount(inEscrowRaw),
      refunded: toViewerAmount(refundedRaw),
      unfunded: toViewerAmount(unfundedRaw),
      requiredDate: longDate(lastDue),
      fee: toViewerAmount(feeRaw),
    },
    createdOn: contract.createdAt ? longDate(contract.createdAt) : undefined,
    milestonesDone,
    allReleased,
    closed,
    canComplete: (contract.isCreator ?? false) && (contract.accepted ?? false) && allReleased && !closed,
    pendingInviteRecipient,
    canCancel: contract.canCancel ?? false,
  };
}

export default function DealDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { t } = useTranslation();
  const { data: contract, isLoading, isError } = useContract(params.id);

  const [release, setRelease] = useState<{ data: ReleaseModalData; milestoneId?: string } | null>(null);
  const [revision, setRevision] = useState<RevisionModalData | null>(null);
  const [submitWork, setSubmitWork] = useState<SubmitWorkModalData | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [menuOpen]);

  const releaseMutation = useReleaseMilestone();
  const submit = useSubmitWork();
  const revise = useRequestRevision();
  const dispute = useDisputeMilestone();
  const accept = useAcceptDeal();
  const decline = useDeclineDeal();
  const complete = useCompleteProject();
  const cancelDeal = useCancelDeal();
  const cancelMilestone = useCancelMilestone();
  const remind = useRemindCounterparty();
  const busy =
    releaseMutation.isPending ||
    submit.isPending ||
    revise.isPending ||
    dispute.isPending ||
    accept.isPending ||
    decline.isPending ||
    complete.isPending ||
    cancelDeal.isPending ||
    cancelMilestone.isPending ||
    remind.isPending;

  const onErr = (error: unknown) => toast.error(normaliseError(error).message);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Loader2 className="size-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (isError || !contract) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-sm font-bold text-ink">{t('deals.detailTitle')}</p>
        <p className="mt-1 text-[13px] text-muted-foreground">
          {isError ? normaliseError(undefined).message : 'Deal not found'}
        </p>
        <Link href="/deals" className="mt-2 text-[13px] font-semibold text-brand-700 hover:underline">
          ← {t('nav.deals')}
        </Link>
      </div>
    );
  }

  const deal = mapContract(contract);
  const firstName = (name: string) => name.split(' ')[0];
  const nextText = dealNextText(t, deal, firstName);
  const counterparty = deal.counterparty;
  // A "simple" deal is a single payment for the whole job - no milestone
  // timeline and no "add milestone". Mirrors mobile `isSimple` (milestones ≤ 1).
  const isSimple = deal.milestones.length <= 1;
  const singleMilestone = deal.milestones[0];

  // Share the invite/join link if the backend provides one, else the page URL.
  const shareUrl = contract.inviteLink || (typeof window !== 'undefined' ? window.location.href : '');
  const copyLink = async () => {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast.success(t('deals.detail.linkCopied'));
    } catch {
      toast.error(t('deals.detail.linkCopyFailed'));
    }
  };
  const shareDeal = async () => {
    setMenuOpen(false);
    const nav = typeof navigator !== 'undefined' ? navigator : undefined;
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ title: deal.title, text: t('deals.detail.shareText', { title: deal.title }), url: shareUrl });
      } catch {
        /* dismissed */
      }
    } else {
      await copyLink();
    }
  };

  const openRelease = (milestone?: VMMilestone) => {
    const target = milestone ?? deal.milestones.find((m) => m.id === deal.releaseMilestoneId);
    setRelease({
      milestoneId: target?.id ?? deal.releaseMilestoneId,
      data: {
        amount: target?.amount ?? deal.releaseAmount,
        currency: deal.currency,
        approx: deal.releaseApprox,
        payeeName: deal.payee.name,
        payeeFirstName: firstName(deal.payee.name),
        milestoneIndex: target?.index ?? deal.releaseMilestoneIndex,
      },
    });
  };

  const confirmRelease = () => {
    const milestoneId = release?.milestoneId;
    if (!milestoneId) {
      setRelease(null);
      return;
    }
    releaseMutation.mutate(milestoneId, {
      onSuccess: () => {
        toast.success(t('deals.detail.approveRelease'));
        setRelease(null);
      },
      onError: (error) => {
        onErr(error);
        setRelease(null);
      },
    });
  };

  const onFund = (milestoneId?: string) => {
    if (!milestoneId) return;
    if (!deal.accepted) {
      toast.error(t('deals.detail.signedPending'));
      return;
    }
    router.push(`/deals/${deal.id}/fund?milestone=${milestoneId}`);
  };
  const onSubmitWork = (milestoneId: string) => {
    const target = deal.milestones.find((milestone) => milestone.id === milestoneId);
    setSubmitWork({
      milestoneId,
      milestoneTitle: target?.title ?? deal.title,
      revisionNote: target?.revisionNote,
    });
  };
  const confirmSubmitWork = (payload: { note?: string; images: string[] }) => {
    const milestoneId = submitWork?.milestoneId;
    if (!milestoneId) {
      setSubmitWork(null);
      return;
    }
    submit.mutate(
      { milestoneId, note: payload.note, images: payload.images },
      {
        onError: onErr,
        onSuccess: () => {
          toast.success(t('deals.submit.successToast', { defaultValue: 'Delivery submitted' }));
          setSubmitWork(null);
        },
      },
    );
  };
  const onRevise = (milestoneId: string) => {
    const target = deal.milestones.find((milestone) => milestone.id === milestoneId);
    setRevision({
      milestoneId,
      milestoneIndex: target?.index ?? 1,
      milestoneTitle: target?.title ?? deal.title,
    });
  };
  const confirmRevision = (feedback: string) => {
    const milestoneId = revision?.milestoneId;
    if (!milestoneId) {
      setRevision(null);
      return;
    }
    revise.mutate(
      { milestoneId, feedback },
      {
        onError: onErr,
        onSuccess: () => {
          toast.success(t('deals.revision.successToast', { defaultValue: 'Revision requested' }));
          setRevision(null);
        },
      },
    );
  };
  const onDispute = (milestoneId: string) => {
    const description = window.prompt(t('deals.detail.openDispute'));
    if (!description || !description.trim()) return;
    dispute.mutate({ milestoneId, reason: 'OTHER', description: description.trim() }, { onError: onErr });
  };
  const onAccept = () =>
    accept.mutate(deal.id, { onError: onErr, onSuccess: () => toast.success(t('deals.accept')) });
  const onDecline = () => {
    if (!window.confirm(t('deals.declineConfirm'))) return;
    decline.mutate(deal.id, {
      onError: onErr,
      onSuccess: () => {
        toast.success(t('deals.declineSuccess'));
        router.push('/deals');
      },
    });
  };
  const onComplete = () =>
    complete.mutate(deal.id, { onError: onErr, onSuccess: () => toast.success(t('deals.status.completed')) });
  /**
   * The deal as a document: parties, milestones, fees and what has been
   * released - written from THIS user's side. Opened in a new tab with a
   * short-lived token, since the PDF is fetched by URL without a header.
   */
  const openDealDocument = async () => {
    setMenuOpen(false);
    try {
      const token = await contractsApi.receiptToken(deal.id);
      const base = api.defaults.baseURL ?? '';
      window.open(`${base}${endpoints.contracts.receipt(deal.id)}?rt=${token}`, '_blank', 'noopener');
    } catch (error) {
      toast.error(normaliseError(error).message);
    }
  };

  /**
   * Nudge the other party about whatever the deal is waiting on. Either side can
   * send it; the server decides who owes the next step and words the reminder.
   */
  const onRemind = () => {
    setMenuOpen(false);
    remind.mutate(deal.id, {
      onError: onErr,
      onSuccess: (result) => {
        if (result.yourMove) {
          toast.info(t(`deals.detail.remindYourMove.${result.action ?? 'fund'}`));
          return;
        }
        if (result.nothingPending) {
          toast.info(t('deals.detail.remindNothing'));
          return;
        }
        if (result.tooSoon) {
          toast.info(t('deals.detail.remindTooSoon', { minutes: result.waitMinutes ?? 60 }));
          return;
        }
        toast.success(
          t('deals.detail.remindSent', { name: result.recipientName ?? deal.counterparty.name }),
        );
      },
    });
  };

  /** Creator ends their own deal - only offered while nothing is funded. */
  const onCancelDeal = () => {
    setMenuOpen(false);
    if (!window.confirm(t('deals.detail.cancelDealConfirm'))) return;
    cancelDeal.mutate(
      { contractId: deal.id },
      { onError: onErr, onSuccess: () => toast.success(t('deals.detail.cancelDealSuccess')) },
    );
  };
  /** Creator drops one unfunded milestone; the rest of the deal carries on. */
  const onCancelMilestone = (milestoneId: string) => {
    if (!window.confirm(t('deals.detail.cancelMilestoneConfirm'))) return;
    cancelMilestone.mutate(milestoneId, {
      onError: onErr,
      onSuccess: () => toast.success(t('deals.detail.cancelMilestoneSuccess')),
    });
  };

  const handlers: ActionHandlers = {
    openRelease,
    onFund,
    onSubmitWork,
    onRevise,
    onDispute,
    onAccept,
    onDecline,
    onComplete,
    onCancelMilestone,
    busy,
  };

  return (
    <div>
      {/* ══════════ MOBILE ══════════ */}
      <div className="space-y-5 md:hidden">
        {/* Header actions */}
        <div className="flex items-center justify-between">
          <Link href="/deals" className="flex items-center gap-1.5 text-[14px] font-semibold text-brand-700">
            <ArrowLeft className="size-4" />
            {t('deals.detailTitle')}
          </Link>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={shareDeal}
              aria-label={t('deals.detail.shareDeal')}
              className="flex size-9 items-center justify-center rounded-full border border-hairline text-muted-foreground transition hover:text-ink"
            >
              <Share2 className="size-4" />
            </button>
            <div ref={menuRef} className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                aria-label={t('deals.detail.moreOptions')}
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border transition',
                  menuOpen ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-hairline text-muted-foreground hover:text-ink',
                )}
              >
                <MoreVertical className="size-4" />
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-11 z-30 w-52 rounded-2xl border border-hairline bg-surface p-1.5 shadow-[0_20px_44px_-16px_rgba(11,31,58,0.28)]">
                  <MenuItem icon={Share2} label={t('deals.detail.shareDeal')} onClick={shareDeal} />
                  <MenuItem icon={LinkIcon} label={t('deals.detail.copyLink')} onClick={copyLink} />
                  <MenuItem
                    icon={FileDown}
                    label={t('deals.detail.downloadRecord')}
                    onClick={openDealDocument}
                  />
                  {deal.accepted || deal.isCreator ? (
                    <MenuItem icon={BellRing} label={t('deals.detail.remind')} onClick={onRemind} />
                  ) : null}
                  {deal.canCancel ? (
                    <MenuItem
                      icon={XCircle}
                      label={t('deals.detail.cancelDeal')}
                      onClick={onCancelDeal}
                      destructive
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Title + counterparty */}
        <div>
          <StatusPill tone={DEAL_STATUS_TONE[deal.status]}>{t(`deals.status.${deal.status}`)}</StatusPill>
          <h1 className="mt-2 text-[24px] font-extrabold leading-tight tracking-[-0.5px] text-ink">{deal.title}</h1>
          <div className="mt-3 flex items-center gap-2.5">
            <span
              className={cn(
                'flex size-10 shrink-0 items-center justify-center rounded-full text-[12px] font-bold',
                AVATAR_TONE[counterparty.tone],
              )}
            >
              {counterparty.initials}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold text-ink">{counterparty.name}</p>
              <p className="text-[11.5px] text-muted-foreground">
                {counterparty.isPayee ? t('deals.detail.payee') : t('deals.detail.payer')}
                {counterparty.location ? ` · ${counterparty.location}` : ''} · {counterparty.currency}
              </p>
            </div>
          </div>
        </div>

        {/* Total · You pay */}
        <div className="rounded-2xl border border-hairline bg-[#F5F8FC] p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                {deal.isPayer ? t('deals.detail.totalYouPay') : t('deals.detail.totalYouReceive')}
              </p>
              <p className="text-[26px] font-extrabold tracking-[-0.6px] text-ink">
                {formatMoney(deal.total, deal.currency)}
              </p>
              {deal.approx ? (
                <p className="text-[12px] text-muted-foreground">{deal.approx}</p>
              ) : null}
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">{t('deals.detail.released')}</p>
              <p className="text-lg font-extrabold text-[#16a34a]">
                {formatMoney(deal.financials.released, deal.currency)}
              </p>
            </div>
          </div>
        </div>

        {/* Signed strip */}
        <div
          className={cn(
            'flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold',
            deal.signedBoth ? 'bg-positive-bg text-positive-text' : 'bg-warning-bg-soft text-warning-text',
          )}
        >
          <ShieldCheck className="size-4 shrink-0" />
          {deal.signedBoth ? t('deals.detail.signedBoth') : t('deals.detail.signedPending')}
        </div>

        {/* Scope */}
        {deal.scope ? (
          <div>
            <h2 className="text-sm font-bold text-ink">{t('deals.detail.scope')}</h2>
            <p className="text-body mt-2 text-[13.5px] leading-relaxed">{deal.scope}</p>
          </div>
        ) : null}

        {/* Milestone timeline - only for multi-milestone deals */}
        {!isSimple ? (
          <div>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-ink">{t('deals.detail.timeline')}</h2>
              <button type="button" className="flex items-center gap-1 text-[13px] font-semibold text-brand-700">
                <Plus className="size-3.5" />
                {t('deals.detail.addMilestone')}
              </button>
            </div>
            <div className="mt-4">
              {deal.milestones.map((milestone, index) => (
                <MobileMilestone
                  key={milestone.id}
                  milestone={milestone}
                  isLast={index === deal.milestones.length - 1}
                  deal={deal}
                  handlers={handlers}
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* What-happens-next / action card. Simple deals always show it (the whole
            escrow flow lives here); milestone deals show it only when the inline
            timeline actions aren't the ones driving the flow. */}
        {isSimple || deal.status !== 'in_progress' ? (
          <div className="shadow-card rounded-2xl border border-hairline bg-surface p-4">
            <h2 className="text-sm font-bold text-ink">{t('deals.detail.whatNext')}</h2>
            <p className="text-body mt-2 text-[13px] leading-relaxed">{nextText}</p>
            {isSimple && singleMilestone && showsRevisionRequest(singleMilestone, deal) ? (
              <RevisionBanner milestone={singleMilestone} />
            ) : null}
            {isSimple && singleMilestone?.delivery ? (
              <SimpleDelivery milestone={singleMilestone} />
            ) : null}
            {deal.autoReleaseIn ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-warning-bg-soft px-3 py-2.5 text-[12.5px] font-medium text-warning-text">
                <Clock className="size-4 shrink-0" />
                {t('deals.detail.autoReleases', { time: deal.autoReleaseIn })}
              </div>
            ) : null}
            <div className="mt-4 space-y-2.5">
              <DealActions deal={deal} handlers={handlers} />
            </div>
          </div>
        ) : null}

        {/* Escrow breakdown */}
        <EscrowCard deal={deal} />

        {/* Details */}
        <DetailsCard
          deal={deal}
          onShare={shareDeal}
          onCancel={onCancelDeal}
          onRemind={onRemind}
          onDocument={openDealDocument}
        />
      </div>

      {/* ══════════ DESKTOP ══════════ */}
      <div className="hidden gap-6 md:grid lg:grid-cols-[1.55fr_1fr]">
        {/* Left */}
        <div className="space-y-6">
          {/* Header */}
          <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <StatusPill tone={DEAL_STATUS_TONE[deal.status]}>{t(`deals.status.${deal.status}`)}</StatusPill>
                <h1 className="mt-2 text-[24px] font-extrabold leading-tight tracking-[-0.5px] text-ink">
                  {deal.title}
                </h1>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">{t('deals.detail.total')}</p>
                <p className="text-2xl font-extrabold tracking-[-0.5px] text-ink">
                  {formatMoney(deal.total, deal.currency)}
                </p>
                {deal.approx ? <p className="text-[12px] text-muted-foreground">{deal.approx}</p> : null}
              </div>
            </div>

            {/* Parties */}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <PartyChip party={deal.payer} />
              <ArrowRight className="size-4 shrink-0 text-subtle" />
              <PartyChip party={deal.payee} />
            </div>

            {/* Signed strip */}
            <div
              className={cn(
                'mt-4 flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold',
                deal.signedBoth ? 'bg-positive-bg text-positive-text' : 'bg-warning-bg-soft text-warning-text',
              )}
            >
              <ShieldCheck className="size-4 shrink-0" />
              {deal.signedBoth ? t('deals.detail.signedBoth') : t('deals.detail.signedPending')}
            </div>

            {/* Scope */}
            {deal.scope ? (
              <div className="mt-5">
                <h2 className="text-sm font-bold text-ink">{t('deals.detail.scope')}</h2>
                <p className="text-body mt-2 text-[13.5px] leading-relaxed">{deal.scope}</p>
              </div>
            ) : null}
          </section>

          {/* Milestone timeline - only for multi-milestone deals */}
          {!isSimple ? (
            <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5 md:p-6">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-ink">{t('deals.detail.timeline')}</h2>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-[12.5px] font-semibold text-brand-700 transition hover:border-brand-border hover:bg-brand-50"
                >
                  <Plus className="size-3.5" />
                  {t('deals.detail.addMilestone')}
                </button>
              </div>

              <div className={cn(M_GRID, 'mt-4 border-b border-hairline px-1 pb-2')}>
                {(['milestone', 'amount', 'deliveryDate', 'status'] as const).map((col) => (
                  <span key={col} className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
                    {t(`deals.detail.col.${col}`)}
                  </span>
                ))}
              </div>

              <div className="mt-1 space-y-1">
                {deal.milestones.map((milestone) => (
                  <MilestoneRow key={milestone.id} milestone={milestone} deal={deal} handlers={handlers} />
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {/* Right */}
        <div className="space-y-6">
          {/* What happens next */}
          <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
            <h2 className="text-sm font-bold text-ink">{t('deals.detail.whatNext')}</h2>
            <p className="text-body mt-2 text-[13px] leading-relaxed">{nextText}</p>

            {isSimple && singleMilestone && showsRevisionRequest(singleMilestone, deal) ? (
              <RevisionBanner milestone={singleMilestone} />
            ) : null}

            {isSimple && singleMilestone?.delivery ? (
              <SimpleDelivery milestone={singleMilestone} />
            ) : null}

            {deal.autoReleaseIn ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-warning-bg-soft px-3 py-2.5 text-[12.5px] font-medium text-warning-text">
                <Clock className="size-4 shrink-0" />
                {t('deals.detail.autoReleases', { time: deal.autoReleaseIn })}
              </div>
            ) : null}

            <div className="mt-4 space-y-2.5">
              <DealActions deal={deal} handlers={handlers} />
            </div>
          </section>

          {/* Escrow breakdown */}
          <EscrowCard deal={deal} />

          {/* Details */}
          <DetailsCard
          deal={deal}
          onShare={shareDeal}
          onCancel={onCancelDeal}
          onRemind={onRemind}
          onDocument={openDealDocument}
        />
        </div>
      </div>

      <ReleaseModal data={release?.data ?? null} onCancel={() => setRelease(null)} onConfirm={confirmRelease} />
      <RevisionModal
        data={revision}
        onCancel={() => setRevision(null)}
        onConfirm={confirmRevision}
        busy={revise.isPending}
      />
      <SubmitWorkModal
        data={submitWork}
        onCancel={() => setSubmitWork(null)}
        onConfirm={confirmSubmitWork}
        busy={submit.isPending}
      />
    </div>
  );
}

interface ActionHandlers {
  openRelease: (milestone?: VMMilestone) => void;
  onFund: (milestoneId?: string) => void;
  onSubmitWork: (milestoneId: string) => void;
  onRevise: (milestoneId: string) => void;
  onDispute: (milestoneId: string) => void;
  onAccept: () => void;
  onDecline: () => void;
  onComplete: () => void;
  onCancelMilestone: (milestoneId: string) => void;
  busy: boolean;
}

function MobileMilestone({
  milestone,
  isLast,
  deal,
  handlers,
}: {
  milestone: VMMilestone;
  isLast: boolean;
  deal: DealVM;
  handlers: ActionHandlers;
}) {
  const { t } = useTranslation();
  const expanded = Boolean(milestone.current && milestone.delivery);
  const showRevision = showsRevisionRequest(milestone, deal);

  return (
    <div className="flex gap-3">
      {/* Rail */}
      <div className="flex flex-col items-center">
        <MilestoneDot milestone={milestone} />
        {!isLast ? <span className="my-1 w-0.5 flex-1 rounded-full bg-hairline" /> : null}
      </div>

      {/* Content */}
      <div className={cn('min-w-0 flex-1', isLast ? 'pb-0' : 'pb-5')}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[14px] font-bold text-ink">
              {milestone.index} · {milestone.title}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <StatusPill tone={milestone.tone}>{t(`deals.detail.mStatus.${milestone.statusKey}`)}</StatusPill>
              <span className="text-[11.5px] text-muted-foreground">
                {expanded && milestone.delivery
                  ? t('deals.detail.dueRevision', { date: milestone.deliveryDate, rev: milestone.delivery.revision })
                  : t('deals.detail.due', { date: milestone.deliveryDate })}
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                'text-[14px] font-extrabold',
                milestone.raw === 'CANCELLED' ? 'text-muted-foreground line-through' : 'text-ink',
              )}
            >
              {formatMoney(milestone.amount, milestone.currency, 0)}
            </span>
            {milestone.canCancel ? (
              <button
                type="button"
                disabled={handlers.busy}
                onClick={() => handlers.onCancelMilestone(milestone.id)}
                aria-label={t('deals.detail.cancelMilestone')}
                className="text-muted-foreground transition hover:text-negative disabled:opacity-60"
              >
                <XCircle className="size-4" />
              </button>
            ) : null}
          </div>
        </div>

        {expanded && milestone.delivery ? (
          <div className="mt-3 rounded-2xl border-[1.5px] border-brand-border bg-brand-50/20 p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">
              {t('deals.detail.deliveryNoteShort')}
            </p>
            {milestone.delivery.note ? (
              <p className="text-body mt-1.5 text-[13px] leading-relaxed">{milestone.delivery.note}</p>
            ) : null}
            {milestone.delivery.images.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {milestone.delivery.images.map((src, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={index} src={src} alt="" className="size-16 rounded-lg object-cover" />
                ))}
              </div>
            ) : null}

            {milestone.autoReleaseIn ? (
              <div className="mt-3 flex items-center gap-2 rounded-xl bg-warning-bg-soft px-3 py-2.5 text-[12.5px] font-medium text-warning-text">
                <Clock className="size-4 shrink-0" />
                {t('deals.detail.autoReleases', { time: milestone.autoReleaseIn })}
              </div>
            ) : null}

            {showRevision ? <RevisionBanner milestone={milestone} /> : null}

            <MilestoneInlineActions milestone={milestone} handlers={handlers} />
          </div>
        ) : (
          <>
            {showRevision ? <RevisionBanner milestone={milestone} /> : null}
            <MilestoneInlineActions milestone={milestone} handlers={handlers} bare />
          </>
        )}
      </div>
    </div>
  );
}

/** The primary/secondary buttons for a single milestone (submit / approve / revise / dispute / fund). */
function MilestoneInlineActions({
  milestone,
  handlers,
  bare = false,
}: {
  milestone: VMMilestone;
  handlers: ActionHandlers;
  bare?: boolean;
}) {
  const { t } = useTranslation();
  if (milestone.actions.length === 0) return null;

  const primary = milestone.actions.find((entry) => entry.kind === 'primary');
  const secondary = milestone.actions.filter((entry) => entry.kind === 'secondary');

  const run = (action: MilestoneActionKey) => {
    if (action === 'fund') handlers.onFund(milestone.id);
    else if (action === 'submit') handlers.onSubmitWork(milestone.id);
    else if (action === 'approve') handlers.openRelease(milestone);
    else if (action === 'revise') handlers.onRevise(milestone.id);
    else if (action === 'dispute') handlers.onDispute(milestone.id);
  };

  return (
    <div className={cn('space-y-2.5', bare ? 'mt-3' : 'mt-3')}>
      {primary ? (
        <button
          type="button"
          disabled={handlers.busy}
          onClick={() => run(primary.action)}
          className={cn(
            'h-12 w-full rounded-xl text-sm font-semibold text-white transition disabled:opacity-60',
            primary.action === 'approve'
              ? 'bg-[#15803D] shadow-[0_12px_28px_-10px_rgba(21,128,61,0.55)] hover:bg-[#166534]'
              : 'bg-primary shadow-brand hover:opacity-95',
          )}
        >
          {primaryLabel(t, primary.action)}
        </button>
      ) : null}
      {secondary.length > 0 ? (
        <div className="flex gap-2.5">
          {secondary.map((entry) =>
            entry.action === 'dispute' ? (
              <button
                key={entry.action}
                type="button"
                disabled={handlers.busy}
                onClick={() => run(entry.action)}
                className="flex h-11 flex-1 items-center justify-center rounded-xl border border-negative-bg text-[13px] font-semibold text-negative transition hover:bg-negative-bg-soft disabled:opacity-60"
              >
                {t('deals.detail.openDispute')}
              </button>
            ) : (
              <button
                key={entry.action}
                type="button"
                disabled={handlers.busy}
                onClick={() => run(entry.action)}
                className="h-11 flex-1 rounded-xl border border-hairline text-[13px] font-semibold text-ink transition hover:bg-muted disabled:opacity-60"
              >
                {t('deals.detail.requestRevision')}
              </button>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function primaryLabel(t: (key: string, params?: Record<string, string>) => string, action: MilestoneActionKey): string {
  if (action === 'approve') return t('deals.detail.approveRelease');
  if (action === 'fund') return t('deals.next.fundEscrow');
  if (action === 'submit') return t('deals.detail.submitWork');
  return action;
}

function PartyChip({ party }: { party: VMParty }) {
  const { t } = useTranslation();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
          AVATAR_TONE[party.tone],
        )}
      >
        {party.initials}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13.5px] font-bold text-ink">{party.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {t(party.roleKey)} · {party.currency}
        </p>
      </div>
    </div>
  );
}

/** Whether the payee should see the payer's revision request on this milestone. */
function showsRevisionRequest(milestone: VMMilestone, deal: DealVM): boolean {
  return !deal.isPayer && milestone.raw === 'ACTIVE' && Boolean(milestone.revisionNote);
}

/** Banner shown to the payee with the payer's revision feedback (what to fix). */
function RevisionBanner({ milestone }: { milestone: VMMilestone }) {
  const { t } = useTranslation();
  if (!milestone.revisionNote) return null;
  return (
    <div className="mt-3 rounded-xl border border-warning-border bg-warning-bg-soft p-3.5">
      <div className="flex items-center gap-2 text-warning-text">
        <RotateCcw className="size-4 shrink-0" />
        <p className="text-[11px] font-bold uppercase tracking-wider">
          {t('deals.detail.revisionRequested', { defaultValue: 'Revision requested' })}
        </p>
      </div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-warning-text">{milestone.revisionNote}</p>
    </div>
  );
}

/** The submitted deliverable (note + images) for a simple, single-payment deal. */
function SimpleDelivery({ milestone }: { milestone: VMMilestone }) {
  const { t } = useTranslation();
  const delivery = milestone.delivery;
  if (!delivery) return null;
  return (
    <div className="mt-3 rounded-xl border border-hairline bg-brand-50/20 p-3.5">
      <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">
        {t('deals.detail.deliveryNote', { rev: delivery.revision })}
      </p>
      {delivery.note ? (
        <p className="text-body mt-1.5 text-[13px] leading-relaxed">{delivery.note}</p>
      ) : null}
      {delivery.images.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {delivery.images.map((imageSrc, imageIndex) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={imageIndex} src={imageSrc} alt="" className="size-16 rounded-lg object-cover" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A single row in the "⋮" more-options dropdown. */
function MenuItem({
  icon: Icon,
  label,
  onClick,
  destructive = false,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13.5px] font-semibold transition hover:bg-muted',
        destructive ? 'text-negative' : 'text-ink',
      )}
    >
      <Icon className={cn('size-4', destructive ? 'text-negative' : 'text-muted-foreground')} />
      {label}
    </button>
  );
}

/** Escrow breakdown: what is held, released, refunded and not-yet-funded. Shared by mobile + desktop. */
function EscrowCard({ deal }: { deal: DealVM }) {
  const { t } = useTranslation();
  const { released, inEscrow, refunded, unfunded } = deal.financials;

  const rows: { key: string; label: string; value: number; icon: LucideIcon; tone: 'ink' | 'positive' | 'muted' }[] = [
    { key: 'held', label: t('deals.detail.escrowHeld'), value: inEscrow, icon: Lock, tone: 'ink' },
    { key: 'released', label: t('deals.detail.released'), value: released, icon: CheckCircle2, tone: 'positive' },
  ];
  if (refunded > 0) {
    rows.push({ key: 'refunded', label: t('deals.detail.refunded'), value: refunded, icon: RotateCcw, tone: 'ink' });
  }
  if (unfunded > 0) {
    rows.push({ key: 'unfunded', label: t('deals.detail.unfunded'), value: unfunded, icon: Clock, tone: 'muted' });
  }

  return (
    <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
      <div className="flex items-center gap-2">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
          <ShieldCheck className="size-4" />
        </span>
        <h2 className="text-sm font-bold text-ink">{t('deals.detail.escrow')}</h2>
      </div>

      <dl className="mt-4 space-y-3">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-3">
            <dt className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <row.icon className="size-3.5 text-subtle" />
              {row.label}
            </dt>
            <dd
              className={cn(
                'text-[13.5px] font-bold',
                row.tone === 'positive' ? 'text-[#16a34a]' : row.tone === 'muted' ? 'text-muted-foreground' : 'text-ink',
              )}
            >
              {formatMoney(row.value, deal.currency)}
            </dd>
          </div>
        ))}
      </dl>

      <p className="mt-4 flex items-center gap-2 rounded-xl bg-positive-bg px-3 py-2.5 text-[12px] font-medium text-positive-text">
        <ShieldCheck className="size-4 shrink-0" />
        {t('deals.detail.protectedByEscrow')}
      </p>
    </section>
  );
}

/** Deal reference details + share/cancel actions. Shared by mobile + desktop. */
function DetailsCard({
  deal,
  onShare,
  onCancel,
  onRemind,
  onDocument,
}: {
  deal: DealVM;
  onShare: () => void;
  onCancel: () => void;
  onRemind: () => void;
  onDocument: () => void;
}) {
  const { t } = useTranslation();
  const { fee, requiredDate } = deal.financials;

  return (
    <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
      <h2 className="text-sm font-bold text-ink">{t('deals.detail.details')}</h2>
      <dl className="mt-3 space-y-2.5 text-[13px]">
        <DetailRow label={t('deals.detail.dealRef')} value={`#${deal.id.slice(0, 8).toUpperCase()}`} />
        <DetailRow label={t('deals.detail.totalValue')} value={formatMoney(deal.total, deal.currency)} />
        <DetailRow
          label={t('deals.detail.milestonesLabel')}
          value={`${deal.milestonesDone}/${deal.milestones.length}`}
        />
        <DetailRow label={t('deals.detail.bizikFee')} value={formatMoney(fee, deal.currency)} />
        <DetailRow label={t('deals.detail.requiredDate')} value={requiredDate} />
        {deal.createdOn ? <DetailRow label={t('deals.detail.createdOn')} value={deal.createdOn} /> : null}
      </dl>

      <button
        type="button"
        onClick={onShare}
        className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-hairline text-[13.5px] font-semibold text-brand-700 transition hover:border-brand-border hover:bg-brand-50"
      >
        <Share2 className="size-4" />
        {t('deals.detail.shareInvite')}
      </button>

      <button
        type="button"
        onClick={onDocument}
        className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-hairline text-[13.5px] font-semibold text-ink transition hover:bg-muted"
      >
        <FileDown className="size-4" />
        {t('deals.detail.downloadRecord')}
      </button>

      {/* Chasing the other party works from either side of the deal. */}
      {deal.accepted || deal.isCreator ? (
        <button
          type="button"
          onClick={onRemind}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-hairline text-[13.5px] font-semibold text-ink transition hover:bg-muted"
        >
          <BellRing className="size-4" />
          {t('deals.detail.remind')}
        </button>
      ) : null}

      {/* Only the creator sees this, and only while nothing has been funded. */}
      {deal.canCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-negative-bg text-[13.5px] font-semibold text-negative transition hover:bg-negative-bg-soft"
        >
          <XCircle className="size-4" />
          {t('deals.detail.cancelDeal')}
        </button>
      ) : null}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-semibold text-ink">{value}</dd>
    </div>
  );
}

function MilestoneRow({
  milestone,
  deal,
  handlers,
}: {
  milestone: VMMilestone;
  deal: DealVM;
  handlers: ActionHandlers;
}) {
  const { t } = useTranslation();
  const showRevision = showsRevisionRequest(milestone, deal);
  const cancelled = milestone.raw === 'CANCELLED';
  const row = (
    <div className={M_GRID}>
      <div className="flex min-w-0 items-center gap-2.5">
        <MilestoneDot milestone={milestone} />
        <span
          className={cn(
            'truncate text-[13.5px] font-semibold',
            cancelled ? 'text-muted-foreground line-through' : 'text-ink',
          )}
        >
          {milestone.index} · {milestone.title}
        </span>
      </div>
      <span className="text-[13px] font-bold text-ink">{formatMoney(milestone.amount, milestone.currency, 0)}</span>
      <span className="text-[12.5px] text-body">{milestone.deliveryDate}</span>
      <span className="flex items-center justify-between gap-2">
        <StatusPill tone={milestone.tone}>{t(`deals.detail.mStatus.${milestone.statusKey}`)}</StatusPill>
        {milestone.canCancel ? (
          <button
            type="button"
            disabled={handlers.busy}
            onClick={() => handlers.onCancelMilestone(milestone.id)}
            title={t('deals.detail.cancelMilestone')}
            aria-label={t('deals.detail.cancelMilestone')}
            className="text-muted-foreground transition hover:text-negative disabled:opacity-60"
          >
            <XCircle className="size-4" />
          </button>
        ) : null}
      </span>
    </div>
  );

  if ((milestone.current && milestone.delivery) || showRevision) {
    return (
      <div className="rounded-2xl border-[1.5px] border-brand-border bg-brand-50/20 p-3">
        {row}
        {milestone.delivery ? (
          <div className="mt-3 rounded-xl border border-hairline bg-surface p-3.5">
            <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">
              {t('deals.detail.deliveryNote', { rev: milestone.delivery.revision })}
            </p>
            {milestone.delivery.note ? (
              <p className="text-body mt-1.5 text-[13px] leading-relaxed">{milestone.delivery.note}</p>
            ) : null}
            {milestone.delivery.images.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {milestone.delivery.images.map((src, index) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={index} src={src} alt="" className="size-16 rounded-lg object-cover" />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {showRevision ? <RevisionBanner milestone={milestone} /> : null}
      </div>
    );
  }

  return <div className="px-1 py-2.5">{row}</div>;
}

function MilestoneDot({ milestone }: { milestone: VMMilestone }) {
  const done = ['RELEASED', 'APPROVED'].includes(milestone.raw);
  const active = ['SUBMITTED', 'FUNDED', 'ACTIVE'].includes(milestone.raw) || milestone.current;
  if (done) {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-positive-bg text-positive-text">
        <Check className="size-3.5" strokeWidth={2.5} />
      </span>
    );
  }
  if (active) {
    return (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full border-2 border-brand-500">
        <span className="size-2 rounded-full bg-brand-500" />
      </span>
    );
  }
  return <span className="size-6 shrink-0 rounded-full border-2 border-[#E2E8F0]" />;
}

function DealActions({ deal, handlers }: { deal: DealVM; handlers: ActionHandlers }) {
  const { t } = useTranslation();

  const disputeButton = (milestoneId: string) => (
    <button
      type="button"
      disabled={handlers.busy}
      onClick={() => handlers.onDispute(milestoneId)}
      className="flex h-11 w-full items-center justify-center rounded-xl border border-negative-bg text-[13.5px] font-semibold text-negative transition hover:bg-negative-bg-soft disabled:opacity-60"
    >
      {t('deals.detail.openDispute')}
    </button>
  );

  // Creator can close out a fully-released project.
  if (deal.canComplete) {
    return (
      <button
        type="button"
        disabled={handlers.busy}
        onClick={handlers.onComplete}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#15803D] text-sm font-semibold text-white shadow-[0_12px_28px_-10px_rgba(21,128,61,0.55)] transition hover:bg-[#166534] disabled:opacity-60"
      >
        <CheckCircle2 className="size-4" />
        {t('deals.detail.markComplete')}
      </button>
    );
  }

  // Recipient of a pending invite: accept / decline.
  if (deal.pendingInviteRecipient) {
    return (
      <>
        <button
          type="button"
          disabled={handlers.busy}
          onClick={handlers.onAccept}
          className="bg-primary shadow-brand h-12 w-full rounded-xl text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
        >
          {t('deals.accept')}
        </button>
        <button
          type="button"
          disabled={handlers.busy}
          onClick={handlers.onDecline}
          className="h-11 w-full rounded-xl border border-negative-bg text-[13.5px] font-semibold text-negative transition hover:bg-negative-bg-soft disabled:opacity-60"
        >
          {t('deals.decline')}
        </button>
      </>
    );
  }

  const submitted = deal.milestones.find((milestone) => milestone.raw === 'SUBMITTED');

  // A delivery is in: the PAYER approves / revises / disputes, the payee waits.
  // Driven by the submitted milestone + role (not the contract status, which can
  // read "In review" or "In progress" depending on the other milestones).
  if (submitted && deal.isPayer) {
    return (
      <>
        <button
          type="button"
          disabled={handlers.busy}
          onClick={() => handlers.openRelease(submitted)}
          className="h-12 w-full rounded-xl bg-[#15803D] text-sm font-semibold text-white shadow-[0_12px_28px_-10px_rgba(21,128,61,0.55)] transition hover:bg-[#166534] disabled:opacity-60"
        >
          {t('deals.detail.approveRelease')}
        </button>
        <button
          type="button"
          disabled={handlers.busy}
          onClick={() => handlers.onRevise(submitted.id)}
          className="h-11 w-full rounded-xl border border-hairline text-[13.5px] font-semibold text-ink transition hover:bg-muted disabled:opacity-60"
        >
          {t('deals.detail.requestRevision')}
        </button>
        {disputeButton(submitted.id)}
      </>
    );
  }

  // Payer, awaiting funding: fund the first pending milestone's escrow.
  if (deal.status === 'awaiting_funding' && deal.isPayer) {
    const pending = deal.milestones.find((milestone) => milestone.raw === 'PENDING');
    return (
      <button
        type="button"
        disabled={handlers.busy || !pending}
        onClick={() => handlers.onFund(pending?.id)}
        className="bg-primary shadow-brand flex h-12 w-full items-center justify-center rounded-xl text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
      >
        {t('deals.next.fundEscrow')}
      </button>
    );
  }

  // Payee, work funded: submit the deliverable.
  const submittable = deal.milestones.find(
    (milestone) => !deal.isPayer && ['FUNDED', 'ACTIVE'].includes(milestone.raw),
  );
  if (submittable) {
    return (
      <button
        type="button"
        disabled={handlers.busy}
        onClick={() => handlers.onSubmitWork(submittable.id)}
        className="bg-primary shadow-brand h-12 w-full rounded-xl text-sm font-semibold text-white transition hover:opacity-95 disabled:opacity-60"
      >
        {t('deals.detail.submitWork')}
      </button>
    );
  }

  // Payee whose delivery is in: waiting for the payer to approve (can dispute).
  if (submitted || deal.status === 'in_review') {
    return (
      <>
        <button
          type="button"
          disabled
          className="h-12 w-full cursor-not-allowed rounded-xl bg-field text-sm font-semibold text-subtle"
        >
          {t('deals.next.waitingApproval')}
        </button>
        {submitted ? disputeButton(submitted.id) : null}
      </>
    );
  }

  return null;
}

function dealNextText(
  t: (key: string, params?: Record<string, string>) => string,
  deal: DealVM,
  firstName: (name: string) => string,
): string {
  const hasSubmitted = deal.milestones.some((milestone) => milestone.raw === 'SUBMITTED');
  const hasFunded = deal.milestones.some((milestone) => ['FUNDED', 'ACTIVE'].includes(milestone.raw));

  // A delivery is awaiting approval - the payer reviews, the payee waits.
  if (hasSubmitted) {
    return deal.isPayer
      ? t('deals.detail.next.review', { amount: formatMoney(deal.releaseAmount, deal.currency) })
      : t('deals.detail.next.waiting', {
          name: firstName(deal.payer.name),
          amount: formatMoney(deal.releaseAmount, deal.currency),
        });
  }

  // Escrow funded, work not yet submitted - the payee delivers, the payer waits.
  if (hasFunded) {
    return deal.isPayer
      ? t('deals.detail.next.awaitingDelivery', { name: firstName(deal.payee.name) })
      : t('deals.detail.next.deliver');
  }

  if (deal.status === 'awaiting_funding') {
    return deal.isPayer
      ? t('deals.detail.next.fund', { name: firstName(deal.payee.name) })
      : t('deals.detail.next.awaitingFund', { name: firstName(deal.payer.name) });
  }

  return t('deals.detail.next.invite', { name: firstName(deal.payer.name) });
}
