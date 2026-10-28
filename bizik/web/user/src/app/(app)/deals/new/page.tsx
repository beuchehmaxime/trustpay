'use client';

import { Fragment, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import {
  Banknote,
  Calendar,
  Check,
  CreditCard,
  Infinity as InfinityIcon,
  Loader2,
  PlusCircle,
  Plus,
  ShieldCheck,
  X,
} from 'lucide-react';

import { PhoneField } from '@/components/ui/phone-field';
import { normaliseError } from '@/lib/api/client';
import { useAuthStore } from '@/lib/auth/auth.store';
import { useCreateProject } from '@/lib/hooks/use-contract';
import { useDebounced, useUserLookup } from '@/lib/hooks/use-user-lookup';
import { useWallet } from '@/lib/hooks/use-wallet';
import { currencySymbol, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const FEE_PCT = 1.5;

/**
 * A counterparty phone must look like a plausible international number (optional
 * leading +, then ≥6 digits) before we run the account lookup - mirrors the
 * mobile New Contract flow's `PHONE_RE`.
 */
const PHONE_RE = /^\+?[0-9][0-9\s]{5,}$/;

type DealType = 'simple' | 'milestones';
type StepKey = 'basics' | 'milestones' | 'review';
interface MilestoneDraft {
  id: number;
  title: string;
  amount: number;
  date: string;
}

const INPUT =
  'h-12 w-full rounded-xl border border-hairline bg-surface px-4 text-[15px] text-ink outline-none transition placeholder:text-subtle focus:border-brand-500';

/** Two-letter avatar initials from a full name (e.g. "Kwame Mensah" → "KM"). */
function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const firstInitial = words[0][0] ?? '';
  const lastInitial = words.length > 1 ? words[words.length - 1][0] ?? '' : '';
  return (firstInitial + lastInitial).toUpperCase();
}

function formatDate(value: string, short = false): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(
    'en-GB',
    short ? { day: '2-digit', month: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' },
  );
}

/**
 * Identity check, at the screen itself.
 *
 * The backend refuses to create a deal for an unverified account (Q-422-KYC),
 * but nothing in this app said so: every route into the wizard was open, so a
 * user filled in a whole deal and was rejected at the last step. Gating the
 * screen rather than the buttons means no entry point, deep link or back-stack
 * entry can slip past it.
 */
function VerifyFirst() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-md flex-col items-center justify-center px-6 text-center">
      <span className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600">
        <ShieldCheck className="size-8" />
      </span>
      <h1 className="text-xl font-extrabold text-ink">{t('newDeal.gate.title')}</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{t('newDeal.gate.body')}</p>
      <Link
        href="/settings/kyc"
        className="bg-primary mt-6 flex h-12 items-center justify-center rounded-xl px-6 text-sm font-bold text-white transition hover:opacity-95"
      >
        {t('newDeal.gate.cta')}
      </Link>
      <p className="mt-4 text-xs text-muted-foreground">{t('newDeal.gate.footer')}</p>
    </div>
  );
}

export default function NewDealPage() {
  const router = useRouter();
  const { t } = useTranslation();
  // Both flags come from the backend, which owns the bar (the "verified" tier
  // and whether deals require it are operator settings). Reading them keeps this
  // screen from disagreeing with the API that will accept or refuse the deal.
  const blocked = useAuthStore(
    (state) => !!state.user && state.user.dealsRequireKyc !== false && state.user.verified === false,
  );
  const idRef = useRef(2);
  // The deal is created in the creator's own currency - sourced from the live
  // wallet overview (SRS MOD-06), never a hard-coded demo currency.
  const { homeCurrency } = useWallet();

  const [step, setStep] = useState(0);
  // Simple is the default: one payment is what most deals are, and the
  // milestones path adds a whole extra step to the wizard for people who do
  // not need it.
  const [dealType, setDealType] = useState<DealType>('simple');
  const [title, setTitle] = useState('');
  // Full E.164-ish value from the joined phone field (dial code + local digits).
  // Empty, so PhoneField picks the default itself rather than this screen
  // hardcoding a country. It said '+233' - Ghana - which is not a market we
  // operate in, so every deal invite started on the wrong code.
  const [phone, setPhone] = useState('');
  const [counterpartyName, setCounterpartyName] = useState('');
  const [iAmPayer, setIAmPayer] = useState(true);
  const [amount, setAmount] = useState(0);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [scope, setScope] = useState('');
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([{ id: 1, title: '', amount: 0, date: '' }]);
  const createProject = useCreateProject();

  const steps: StepKey[] = dealType === 'milestones' ? ['basics', 'milestones', 'review'] : ['basics', 'review'];
  const stepKey = steps[step];

  // Live "is this person already on BiZik?" lookup by phone (debounced + shape-
  // validated). A real match auto-fills the name and locks the field; otherwise
  // the user types the counterparty's name and we invite them by SMS.
  const trimmedPhone = phone.trim();
  const phoneValid = PHONE_RE.test(trimmedPhone);
  const debouncedPhone = useDebounced(trimmedPhone);
  const phoneLookup = useUserLookup(
    { phone: debouncedPhone.replace(/\s+/g, '') },
    PHONE_RE.test(debouncedPhone),
  );
  const matchedUser =
    phoneLookup.data?.found && !phoneLookup.data.self ? phoneLookup.data : null;
  // When the phone matches an existing account we submit that account's name and
  // lock the field; otherwise we submit whatever the user typed. Deriving the
  // effective name (rather than syncing it into state via an effect) keeps the
  // typed name intact if the match later clears, and avoids cascading renders.
  const effectiveName = matchedUser?.fullName ?? counterpartyName.trim();

  // Lookup-hint states, mirroring the mobile `LookupHint`.
  const lookupChecking = phoneValid && phoneLookup.isLoading;
  const lookupSelf = phoneValid && Boolean(phoneLookup.data?.self);
  const showInvite = phoneValid && !phoneLookup.isLoading && phoneLookup.data?.found === false;

  const counterpartyFirst = effectiveName.split(/\s+/)[0] ?? '';

  const fee = Math.round(amount * (FEE_PCT / 100) * 100) / 100;
  const total = amount + fee;
  const milestoneTotal = milestones.reduce((sum, item) => sum + item.amount, 0);
  const remaining = amount - milestoneTotal;
  // Counterparty name is OPTIONAL - we invite by phone and fall back to their
  // own account name. Only title, amount and a valid phone are required.
  const basicsValid = title.trim().length > 0 && amount > 0 && phoneValid;

  const next = () => setStep((value) => Math.min(steps.length - 1, value + 1));
  const back = () => setStep((value) => Math.max(0, value - 1));
  const close = () => router.push('/deals');

  const addMilestone = () =>
    setMilestones((current) => [...current, { id: ++idRef.current, title: '', amount: 0, date: '' }]);
  const updateMilestone = (id: number, patch: Partial<MilestoneDraft>) =>
    setMilestones((current) => current.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  const removeMilestone = (id: number) =>
    setMilestones((current) => (current.length > 1 ? current.filter((item) => item.id !== id) : current));

  const create = async () => {
    if (createProject.isPending) return;
    // The deal is created in the creator's own currency; amounts are entered in
    // the home currency throughout. The name we submit is whatever the user
    // ended up with - a real matched account name or one they typed.
    const finalName = effectiveName;
    const dealMilestones =
      dealType === 'simple'
        ? [{ title: title.trim(), amount, dueDate: deliveryDate || undefined }]
        : milestones.map((item) => ({
            title: item.title.trim(),
            amount: item.amount,
            dueDate: item.date || deliveryDate || undefined,
          }));
    try {
      const created = await createProject.mutateAsync({
        title: title.trim(),
        description: scope.trim() || undefined,
        currency: homeCurrency,
        counterpartyName: finalName || undefined,
        counterpartyPhone: trimmedPhone,
        creatorIsPayer: iAmPayer,
        milestones: dealMilestones,
      });
      toast.success(t('newDeal.review.created'), {
        description: t('newDeal.review.createdBody', { name: finalName }),
      });
      router.push(created?.id ? `/deals/${created.id}` : '/deals');
    } catch (error) {
      toast.error(normaliseError(error).message);
    }
  };

  // After every hook, so the hook order never changes between renders.
  if (blocked) return <VerifyFirst />;

  return (
    <div className="mx-auto w-full max-w-[520px] md:max-w-[1000px]">
      {/* Mobile header: close + step + segments */}
      <div className="md:hidden">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-ink"
          >
            <X className="size-5" />
          </button>
          <span className="text-[13px] font-semibold text-muted-foreground">
            {t('newDeal.step', { n: step + 1, total: steps.length })}
          </span>
        </div>
        <div className="mt-3 flex gap-2">
          {steps.map((entry, index) => (
            <span
              key={entry}
              className={cn('h-1.5 flex-1 rounded-full', index <= step ? 'bg-brand-500' : 'bg-[#E6EBF2]')}
            />
          ))}
        </div>
      </div>

      {/* Desktop header: numbered horizontal stepper */}
      <div className="hidden md:flex md:items-center">
        {steps.map((entry, index) => (
          <Fragment key={entry}>
            <div className="flex shrink-0 items-center gap-2.5">
              <span
                className={cn(
                  'flex size-8 items-center justify-center rounded-full text-[13px] font-bold',
                  index <= step ? 'bg-brand-500 text-white' : 'bg-muted text-muted-foreground',
                )}
              >
                {index + 1}
              </span>
              <span className={cn('text-[14px] font-semibold', index <= step ? 'text-ink' : 'text-muted-foreground')}>
                {t(`newDeal.${entry}.title`)}
              </span>
            </div>
            {index < steps.length - 1 ? (
              <span className={cn('mx-4 h-0.5 flex-1 rounded-full', index < step ? 'bg-brand-500' : 'bg-hairline')} />
            ) : null}
          </Fragment>
        ))}
      </div>

      {/* Step content (framed as a card on desktop) */}
      <div className="md:shadow-card md:mt-6 md:rounded-3xl md:border md:border-hairline md:bg-surface md:p-8">
        {stepKey === 'basics' ? (
          <BasicsStep
            {...{
              dealType,
              setDealType,
              title,
              setTitle,
              phone,
              setPhone,
              counterpartyName,
              setCounterpartyName,
              matchedName: matchedUser?.fullName ?? '',
              isMatched: Boolean(matchedUser),
              lookupChecking,
              lookupSelf,
              showInvite,
              iAmPayer,
              setIAmPayer,
              amount,
              setAmount,
              deliveryDate,
              setDeliveryDate,
              scope,
              setScope,
              homeCurrency,
              basicsValid,
              onCancel: close,
              onContinue: next,
            }}
          />
        ) : null}

        {stepKey === 'milestones' ? (
          <MilestonesStep
            milestones={milestones}
            remaining={remaining}
            milestoneTotal={milestoneTotal}
            homeCurrency={homeCurrency}
            onUpdate={updateMilestone}
            onAdd={addMilestone}
            onRemove={removeMilestone}
            onBack={back}
            onContinue={next}
          />
        ) : null}

        {stepKey === 'review' ? (
          <ReviewStep
            title={title}
            counterpartyName={effectiveName || trimmedPhone}
            counterpartyFirst={counterpartyFirst}
            iAmPayer={iAmPayer}
            dealType={dealType}
            milestoneCount={milestones.length}
            deliveryLabel={formatDate(deliveryDate)}
            amount={amount}
            fee={fee}
            total={total}
            homeCurrency={homeCurrency}
            creating={createProject.isPending}
            onBack={back}
            onCreate={create}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ── Step 1 · Basics ─────────────────────────────────────────────────────── */

function BasicsStep(props: {
  dealType: DealType;
  setDealType: (value: DealType) => void;
  title: string;
  setTitle: (value: string) => void;
  phone: string;
  setPhone: (value: string) => void;
  counterpartyName: string;
  setCounterpartyName: (value: string) => void;
  matchedName: string;
  isMatched: boolean;
  lookupChecking: boolean;
  lookupSelf: boolean;
  showInvite: boolean;
  iAmPayer: boolean;
  setIAmPayer: (value: boolean) => void;
  amount: number;
  setAmount: (value: number) => void;
  deliveryDate: string;
  setDeliveryDate: (value: string) => void;
  scope: string;
  setScope: (value: string) => void;
  homeCurrency: string;
  basicsValid: boolean;
  onCancel: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();

  return (
    <div className="mt-5 md:mt-0">
      <StepHeading title={t('newDeal.basics.title')} subtitle={t('newDeal.basics.subtitle')} />

      <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-5 md:grid-cols-2">
        {/* Deal type */}
        <div className="min-w-0 md:col-span-2">
          <Label>{t('newDeal.basics.dealType')}</Label>
          <div className="grid grid-cols-2 gap-3 md:max-w-lg">
            <DealTypeCard
              active={props.dealType === 'simple'}
              icon={<PlusCircle className="size-5" />}
              title={t('newDeal.basics.simple')}
              desc={t('newDeal.basics.simpleDesc')}
              onClick={() => props.setDealType('simple')}
            />
            <DealTypeCard
              active={props.dealType === 'milestones'}
              icon={<InfinityIcon className="size-5" />}
              title={t('newDeal.basics.milestones')}
              desc={t('newDeal.basics.milestonesDesc')}
              onClick={() => props.setDealType('milestones')}
            />
          </div>
        </div>

        {/* Title */}
        <div>
          <Label>{t('newDeal.basics.dealTitle')}</Label>
          <input
            className={INPUT}
            value={props.title}
            onChange={(event) => props.setTitle(event.target.value)}
            placeholder={t('newDeal.basics.dealTitlePlaceholder')}
          />
        </div>

        {/* Counterparty phone */}
        <div>
          <Label>{t('newDeal.basics.counterpartyPhone')}</Label>
          <PhoneField
            value={props.phone}
            onChange={props.setPhone}
            placeholder={t('newDeal.basics.phonePlaceholder')}
          />
        </div>

        {/* Counterparty name - auto-filled + locked when they're already on BiZik,
            typed freely (and invited by SMS) when they are not. */}
        <div>
          <Label>{t('newDeal.basics.counterpartyName')}</Label>
          <input
            className={cn(INPUT, props.isMatched && 'cursor-not-allowed bg-muted/40 text-muted-foreground')}
            value={props.isMatched ? props.matchedName : props.counterpartyName}
            onChange={(event) => props.setCounterpartyName(event.target.value)}
            placeholder={t('newDeal.basics.counterpartyNamePlaceholder')}
            disabled={props.isMatched}
            readOnly={props.isMatched}
          />
        </div>

        {/* Live lookup feedback - full width */}
        {props.isMatched ? (
          <div className="flex items-center gap-3 rounded-xl border border-positive-text/20 bg-positive-bg px-3.5 py-2.5 md:col-span-2">
            <span className="flex size-9 items-center justify-center rounded-lg bg-white text-[11px] font-bold text-positive-text">
              {initials(props.matchedName)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13.5px] font-bold text-positive-text">{props.matchedName}</p>
              <p className="text-[11.5px] text-positive-text/80">{t('newDeal.basics.alreadyOnBiZik')}</p>
            </div>
            <Check className="size-5 text-positive-text" />
          </div>
        ) : props.lookupChecking ? (
          <p className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground md:col-span-2">
            <Loader2 className="size-3.5 animate-spin" />
            {t('newDeal.basics.lookupChecking')}
          </p>
        ) : props.lookupSelf ? (
          <p className="text-[11.5px] font-medium text-warning-text md:col-span-2">
            {t('newDeal.basics.lookupSelf')}
          </p>
        ) : props.showInvite ? (
          <p className="text-[11.5px] text-muted-foreground md:col-span-2">{t('newDeal.basics.willInvite')}</p>
        ) : null}

        {/* Role */}
        <div>
          <Label>{t('newDeal.basics.roleQuestion')}</Label>
          <div className="grid grid-cols-2 gap-2">
            {[
              { payer: false, label: t('newDeal.basics.roleGettingPaid'), icon: <Banknote className="size-4" /> },
              { payer: true, label: t('newDeal.basics.rolePaying'), icon: <CreditCard className="size-4" /> },
            ].map((option) => {
              const active = props.iAmPayer === option.payer;
              return (
                <button
                  key={option.label}
                  type="button"
                  onClick={() => props.setIAmPayer(option.payer)}
                  className={cn(
                    'flex items-center justify-center gap-2 rounded-xl border-[1.5px] py-3 text-[14px] font-semibold transition',
                    active
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-hairline bg-surface text-muted-foreground hover:border-brand-border',
                  )}
                >
                  {option.icon}
                  {option.label}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[12px] leading-relaxed text-muted-foreground">
            {props.iAmPayer ? t('newDeal.basics.rolePayingHint') : t('newDeal.basics.roleGettingPaidHint')}
          </p>
        </div>

        {/* Delivery date */}
        <div>
          <Label>{t('newDeal.basics.deliveryDate')}</Label>
          <DateField
            value={props.deliveryDate}
            onChange={props.setDeliveryDate}
            placeholder={t('newDeal.basics.selectDate')}
          />
        </div>

        {/* Amount - full width */}
        <div className="md:col-span-2">
          <Label>{t('newDeal.basics.amount')}</Label>
          <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface px-4">
            <span className="text-xl font-bold text-muted-foreground">{currencySymbol(props.homeCurrency)}</span>
            <input
              inputMode="numeric"
              value={props.amount ? props.amount.toLocaleString('en-US') : ''}
              onChange={(event) => props.setAmount(Number(event.target.value.replace(/[^\d]/g, '')) || 0)}
              placeholder="0.00"
              className="h-12 min-w-0 flex-1 bg-transparent text-[22px] font-extrabold text-ink outline-none placeholder:text-subtle"
            />
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-bold text-ink">{props.homeCurrency}</span>
          </div>
          <p className="mt-1.5 text-[11.5px] text-muted-foreground">
            {t('newDeal.basics.amountNote', { currency: props.homeCurrency })}
          </p>
        </div>

        {/* Scope - full width */}
        <div className="md:col-span-2">
          <Label>{t('newDeal.basics.scope')}</Label>
          <textarea
            value={props.scope}
            onChange={(event) => props.setScope(event.target.value)}
            rows={3}
            placeholder={t('newDeal.basics.scopePlaceholder')}
            className="w-full rounded-xl border border-hairline bg-surface px-4 py-3 text-[14px] leading-relaxed text-ink outline-none transition placeholder:text-subtle focus:border-brand-500"
          />
        </div>
      </div>

      <StepFooter
        secondaryLabel={t('newDeal.cancel')}
        onSecondary={props.onCancel}
        secondaryDesktopOnly
        primaryLabel={t('newDeal.basics.continue')}
        onPrimary={props.onContinue}
        primaryDisabled={!props.basicsValid}
      />
    </div>
  );
}

/* ── Step 2 · Milestones ─────────────────────────────────────────────────── */

function MilestonesStep({
  milestones,
  remaining,
  milestoneTotal,
  homeCurrency,
  onUpdate,
  onAdd,
  onRemove,
  onBack,
  onContinue,
}: {
  milestones: MilestoneDraft[];
  remaining: number;
  milestoneTotal: number;
  homeCurrency: string;
  onUpdate: (id: number, patch: Partial<MilestoneDraft>) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const { t } = useTranslation();
  const allocated = remaining === 0;
  const over = remaining < 0;

  return (
    <div className="mt-5 md:mt-0">
      <StepHeading title={t('newDeal.milestones.title')} subtitle={t('newDeal.milestones.subtitle')} />

      <div className="mx-auto mt-5 max-w-[620px] space-y-4">
        <div className="space-y-3">
          {milestones.map((milestone, index) => {
            const filled = milestone.title.trim().length > 0;
            return (
              <div
                key={milestone.id}
                className={cn(
                  'rounded-2xl border-[1.5px] p-4',
                  filled ? 'border-hairline bg-surface shadow-card' : 'border-dashed border-brand-border bg-surface',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-subtle">
                    {t('newDeal.milestones.milestoneN', { n: index + 1 })}
                  </span>
                  {milestones.length > 1 ? (
                    <button
                      type="button"
                      onClick={() => onRemove(milestone.id)}
                      aria-label="Remove milestone"
                      className="text-subtle transition hover:text-negative"
                    >
                      <X className="size-4" />
                    </button>
                  ) : null}
                </div>
                <input
                  value={milestone.title}
                  onChange={(event) => onUpdate(milestone.id, { title: event.target.value })}
                  placeholder={t('newDeal.milestones.deliverablePlaceholder')}
                  className="mt-1 w-full bg-transparent text-[15px] font-bold text-ink outline-none placeholder:font-medium placeholder:text-subtle"
                />
                <div className="mt-3 flex gap-2">
                  <div className="flex flex-1 items-center gap-2 rounded-xl bg-[#F5F8FC] px-3">
                    <span className="text-[15px] font-bold text-muted-foreground">{currencySymbol(homeCurrency)}</span>
                    <input
                      inputMode="numeric"
                      value={milestone.amount ? milestone.amount.toLocaleString('en-US') : ''}
                      onChange={(event) =>
                        onUpdate(milestone.id, { amount: Number(event.target.value.replace(/[^\d]/g, '')) || 0 })
                      }
                      placeholder={t('newDeal.milestones.amountPlaceholder')}
                      className="h-11 min-w-0 flex-1 bg-transparent text-[15px] font-bold text-ink outline-none placeholder:text-subtle"
                    />
                  </div>
                  <DateField
                    value={milestone.date}
                    onChange={(date) => onUpdate(milestone.id, { date })}
                    placeholder={t('newDeal.milestones.date')}
                    compact
                  />
                </div>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          onClick={onAdd}
          className="shadow-card flex w-full items-center justify-center gap-2 rounded-2xl border border-hairline bg-surface py-3.5 text-[14px] font-semibold text-brand-700 transition hover:bg-brand-50"
        >
          <Plus className="size-4" />
          {t('newDeal.milestones.addMilestone')}
        </button>

        <div className="flex items-center justify-between rounded-2xl bg-[#EEF3FA] px-4 py-3.5">
          <span className="text-[13px] font-semibold text-muted-foreground">{t('newDeal.milestones.runningTotal')}</span>
          <span className="text-lg font-extrabold text-ink">{formatMoney(milestoneTotal, homeCurrency, 2)}</span>
        </div>

        <div
          className={cn(
            'flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] font-medium',
            allocated ? 'bg-positive-bg text-positive-text' : 'bg-warning-bg-soft text-warning-text',
          )}
        >
          <span
            className={cn(
              'flex size-4 shrink-0 items-center justify-center rounded-full text-white',
              allocated ? 'bg-positive-text' : 'bg-warning-text',
            )}
          >
            {allocated ? <Check className="size-3" /> : <span className="text-[10px] font-bold">!</span>}
          </span>
          {allocated
            ? t('newDeal.milestones.allocated')
            : over
              ? t('newDeal.milestones.overAllocated', { amount: formatMoney(Math.abs(remaining), homeCurrency, 0) })
              : t('newDeal.milestones.toAllocate', { amount: formatMoney(remaining, homeCurrency, 0) })}
        </div>
      </div>

      <StepFooter
        secondaryLabel={t('newDeal.milestones.back')}
        onSecondary={onBack}
        primaryLabel={t('newDeal.milestones.continue')}
        onPrimary={onContinue}
        primaryDisabled={milestoneTotal <= 0}
      />
    </div>
  );
}

/* ── Step 3 · Review ─────────────────────────────────────────────────────── */

function ReviewStep({
  title,
  counterpartyName,
  counterpartyFirst,
  iAmPayer,
  dealType,
  milestoneCount,
  deliveryLabel,
  amount,
  fee,
  total,
  homeCurrency,
  creating,
  onBack,
  onCreate,
}: {
  title: string;
  counterpartyName: string;
  counterpartyFirst: string;
  iAmPayer: boolean;
  dealType: DealType;
  milestoneCount: number;
  deliveryLabel: string;
  amount: number;
  fee: number;
  total: number;
  homeCurrency: string;
  creating: boolean;
  onBack: () => void;
  onCreate: () => void;
}) {
  const { t } = useTranslation();
  const payLabel = iAmPayer ? t('newDeal.review.youPay') : t('newDeal.review.theyPay');

  return (
    <div className="mt-5 md:mt-0">
      <StepHeading title={t('newDeal.review.title')} subtitle={t('newDeal.review.subtitle')} />

      <div className="mx-auto mt-5 max-w-[620px] space-y-4">
        <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-subtle">{t('newDeal.review.dealSummary')}</p>
          <h2 className="mt-1 text-lg font-extrabold text-ink">{title || '-'}</h2>

          <dl className="mt-3 space-y-2.5 text-[13px]">
            <Row label={t('newDeal.review.counterparty')} value={counterpartyName} />
            <Row
              label={t('newDeal.review.role')}
              value={iAmPayer ? t('newDeal.review.roleBuyer') : t('newDeal.review.roleSeller')}
              strong
            />
            <Row
              label={t('newDeal.review.dealType')}
              value={
                dealType === 'simple'
                  ? t('newDeal.review.simpleType')
                  : t('newDeal.review.milestonesType', { count: milestoneCount })
              }
              strong
            />
            <Row label={t('newDeal.review.deliveryDate')} value={deliveryLabel} strong />
          </dl>

          <div className="my-3 h-px bg-hairline" />

          <dl className="space-y-2.5 text-[13px]">
            <Row label={t('newDeal.review.escrowValue')} value={formatMoney(amount, homeCurrency, 2)} strong />
            <Row label={t('newDeal.review.bizikFee', { pct: FEE_PCT })} value={formatMoney(fee, homeCurrency, 2)} strong />
          </dl>

          <div className="mt-3 flex items-end justify-between">
            <span className="text-sm font-bold text-ink">{payLabel}</span>
            <div className="text-right">
              <p className="text-2xl font-extrabold tracking-[-0.5px] text-ink">{formatMoney(total, homeCurrency, 2)}</p>
            </div>
          </div>
        </section>

        <div className="flex items-start gap-2.5 rounded-2xl bg-brand-50/70 px-4 py-3.5 text-[12.5px] leading-relaxed text-brand-700">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" />
          {dealType === 'milestones'
            ? t('newDeal.review.infoMilestones', { name: counterpartyFirst })
            : t('newDeal.review.infoSimple', { name: counterpartyFirst })}
        </div>
      </div>

      <StepFooter
        secondaryLabel={t('newDeal.review.back')}
        onSecondary={onBack}
        primaryLabel={t('newDeal.review.create')}
        onPrimary={onCreate}
        primaryLoading={creating}
      />
    </div>
  );
}

/* ── Shared pieces ───────────────────────────────────────────────────────── */

function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <h1 className="text-2xl font-extrabold tracking-[-0.5px] text-ink">{title}</h1>
      <p className="mt-1 text-[13.5px] text-muted-foreground">{subtitle}</p>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[13px] font-bold text-ink">{children}</p>;
}

function DealTypeCard({
  active,
  icon,
  title,
  desc,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-center gap-2.5 rounded-2xl border-[1.5px] px-3 py-2.5 text-left transition',
        active ? 'border-brand-500 bg-brand-50/50' : 'border-hairline bg-surface hover:border-brand-border',
      )}
    >
      <span className={cn('shrink-0', active ? 'text-brand-600' : 'text-muted-foreground')}>{icon}</span>
      {/* min-w-0 so the truncation below actually bites - a flex child defaults
          to a min-content floor and would push the card wider instead. */}
      <span className="min-w-0">
        <span
          className={cn(
            'block truncate text-[14px] font-bold',
            active ? 'text-brand-700' : 'text-ink',
          )}
        >
          {title}
        </span>
        <span className="block truncate text-[11.5px] text-muted-foreground">{desc}</span>
      </span>
    </button>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('text-right', strong ? 'font-bold text-ink' : 'font-semibold text-ink')}>{value}</dd>
    </div>
  );
}

const DATE_PICKER =
  'text-transparent [color-scheme:light] ' +
  '[&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:inset-0 ' +
  '[&::-webkit-calendar-picker-indicator]:m-0 [&::-webkit-calendar-picker-indicator]:h-full ' +
  '[&::-webkit-calendar-picker-indicator]:w-full [&::-webkit-calendar-picker-indicator]:cursor-pointer ' +
  '[&::-webkit-calendar-picker-indicator]:opacity-0';

function DateField({
  value,
  onChange,
  placeholder,
  compact = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  compact?: boolean;
}) {
  return (
    <div className="relative">
      <input
        type="date"
        value={value}
        // A delivery date can't be in the past - block earlier days in the picker.
        min={new Date().toISOString().slice(0, 10)}
        onChange={(event) => onChange(event.target.value)}
        className={cn(compact ? 'h-11 w-28 rounded-xl bg-[#F5F8FC] px-3' : cn(INPUT, 'pr-11'), DATE_PICKER)}
      />
      <span
        className={cn(
          'pointer-events-none absolute inset-y-0 flex items-center',
          compact ? 'left-3 text-[13px]' : 'left-4 text-[15px]',
          value ? 'text-ink' : 'text-subtle',
        )}
      >
        {value ? formatDate(value, compact) : placeholder}
      </span>
      {!compact ? (
        <Calendar className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      ) : null}
    </div>
  );
}

function StepFooter({
  secondaryLabel,
  onSecondary,
  secondaryDesktopOnly = false,
  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  primaryLoading = false,
}: {
  secondaryLabel: string;
  onSecondary: () => void;
  secondaryDesktopOnly?: boolean;
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
}) {
  return (
    <div className="mt-6 flex gap-3 md:mt-8 md:justify-end">
      <button
        type="button"
        onClick={onSecondary}
        className={cn(
          'h-12 rounded-xl border border-hairline px-6 text-[15px] font-semibold text-ink transition hover:bg-muted',
          secondaryDesktopOnly && 'hidden md:inline-flex md:items-center md:justify-center',
        )}
      >
        {secondaryLabel}
      </button>
      <button
        type="button"
        disabled={primaryDisabled || primaryLoading}
        onClick={onPrimary}
        className={cn(
          'flex h-12 flex-1 items-center justify-center rounded-xl px-8 text-[15px] font-semibold transition md:flex-none',
          primaryDisabled || primaryLoading
            ? 'cursor-not-allowed bg-field text-white'
            : 'bg-primary text-white shadow-brand hover:opacity-95',
        )}
      >
        {primaryLoading ? <Loader2 className="size-4 animate-spin" /> : primaryLabel}
      </button>
    </div>
  );
}
