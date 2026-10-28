'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Activity as ActivityIcon,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Bell,
  CheckCircle2,
  Clock,
  Handshake,
  Loader2,
  Lock,
  Plus,
  Receipt,
  ShieldAlert,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

import { DonutChart } from '@/components/charts/donut-chart';
import { InstallBanner } from '@/components/pwa/install-banner';
import { StatusPill, statusTone } from '@/components/ui/status-pill';
import { useAuthStore } from '@/lib/auth/auth.store';
import type { AppNotification, NotificationCategory } from '@/lib/api/notifications.api';
import type { ActiveDeal } from '@/lib/demo/dashboard';
import { useDashboard, type DashboardAttentionCard } from '@/lib/hooks/use-dashboard';
import { useNotifications } from '@/lib/hooks/use-notifications';
import { approxMoney, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';

const QUICK_ACTIONS = [
  { labelKey: 'dashboard.quick.startDeal', href: '/deals/new', icon: Plus },
  { labelKey: 'dashboard.quick.wallet', href: '/wallet', icon: Wallet },
  { labelKey: 'dashboard.quick.disputes', href: '/disputes', icon: ShieldCheck },
  { labelKey: 'dashboard.quick.transactions', href: '/wallet/transactions', icon: Receipt },
] as const;

const ACTIVITY_ICON: Record<NotificationCategory, { icon: LucideIcon; className: string }> = {
  PAYMENT: { icon: Banknote, className: 'bg-positive-bg text-positive' },
  CONTRACT: { icon: Handshake, className: 'bg-brand-50 text-brand-600' },
  KYC: { icon: BadgeCheck, className: 'bg-cyan-bg text-cyan-text' },
  DISPUTE: { icon: ShieldAlert, className: 'bg-negative-bg text-negative' },
  SECURITY: { icon: Lock, className: 'bg-pending-bg text-muted-foreground' },
  SYSTEM: { icon: Bell, className: 'bg-muted text-muted-foreground' },
};

/** Relative "time ago" label from an ISO timestamp. */
function relativeTime(iso: string, translate: (key: string, opts?: Record<string, unknown>) => string): string {
  const elapsedMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(elapsedMs / 60_000);
  if (minutes < 1) return translate('activity.time.now');
  if (minutes < 60) return translate('activity.time.minutesAgo', { n: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return translate('activity.time.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? translate('activity.time.dayAgo', { n: days }) : translate('activity.time.daysAgo', { n: days });
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

export default function DashboardPage() {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { persona, activeDeals, attentionCards, escrowByDeal, isLoading, isError, refetch } = useDashboard();
  const notificationsQuery = useNotifications();
  const recentActivity = (notificationsQuery.data ?? []).slice(0, 5);
  const hasUnread = (notificationsQuery.data ?? []).some((notification) => !notification.read);
  const fullName = user?.fullName ?? 'there';

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="size-6 animate-spin text-brand-500" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-3 py-20 text-center">
        <p className="text-[13px] text-negative">{t('dashboard.loadError')}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="rounded-xl border border-hairline px-4 py-2 text-[13px] font-semibold text-ink transition hover:bg-muted"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Mobile: gradient hero (desktop uses the top bar + KPI row) ── */}
      <section className="bg-hero-gradient -mx-4 -mt-4 rounded-b-[32px] px-5 pb-6 pt-5 text-white md:hidden">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[13px] text-white/80">{t('dashboard.welcomeBack')}</p>
            <p className="truncate text-xl font-extrabold tracking-[-0.3px]">{fullName}</p>
          </div>
          <div className="flex items-center gap-2.5">
            <Link
              href="/activity"
              aria-label="Notifications"
              className="relative flex size-10 items-center justify-center rounded-full bg-white/15"
            >
              <Bell className="size-5" />
              {hasUnread ? (
                <span className="absolute right-2.5 top-2.5 size-2 rounded-full bg-warning ring-2 ring-brand-500" />
              ) : null}
            </Link>
            <Link
              href="/profile"
              aria-label="Profile"
              className="flex size-10 items-center justify-center rounded-2xl bg-white text-[13px] font-bold text-brand-700"
            >
              {initials(fullName)}
            </Link>
          </div>
        </div>

        <p className="mt-6 text-[13px] text-white/80">{t('dashboard.walletBalance')}</p>
        <p className="text-[34px] font-extrabold leading-none -tracking-[1px]">
          {formatMoney(persona.walletBalance, persona.homeCurrency, 2)}
        </p>
        <p className="mt-1.5 text-[12px] text-white/70">{approxMoney(persona.walletBalanceUsd, 'USD')}</p>

        <div className="mt-4 flex gap-2.5">
          <div className="flex-1 rounded-2xl bg-white/15 p-3">
            <p className="flex items-center gap-1.5 text-[11px] text-white/75">
              <Lock className="size-3.5" /> {t('dashboard.lockedInEscrow')}
            </p>
            <p className="mt-1 text-[15px] font-bold">
              {formatMoney(persona.inEscrow, persona.homeCurrency, 0)}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl bg-white px-4 py-3">
            <ShieldCheck className="size-4 shrink-0 text-positive-text" />
            <span className="text-[12px] font-bold leading-tight text-positive-text">
              {t('dashboard.fundsProtected')}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2.5">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.labelKey}
              href={action.href}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-white py-3 text-center shadow-[0_8px_20px_-10px_rgba(11,31,58,0.35)]"
            >
              <action.icon className="size-5 text-brand-600" />
              <span className="text-[11px] font-semibold leading-tight text-ink">{t(action.labelKey)}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Mobile: add-to-home-screen banner ── */}
      <InstallBanner />

      {/* ── Desktop: 4-up KPI row ── */}
      <section className="hidden gap-4 md:grid md:grid-cols-2 lg:grid-cols-4">
        <div className="bg-hero-gradient shadow-card rounded-2xl p-4 text-white">
          <p className="flex items-center gap-1.5 text-[13px] text-white/85">
            <Wallet className="size-4" /> {t('dashboard.walletBalance')}
          </p>
          <p className="mt-3 text-xl font-extrabold -tracking-[0.5px]">
            {formatMoney(persona.walletBalance, persona.homeCurrency, 0)}
          </p>
          <p className="mt-1.5 text-[11px] text-white/70">
            {approxMoney(persona.walletBalanceUsd, 'USD')}
          </p>
        </div>
        <KpiCard
          icon={Lock}
          label={t('dashboard.inEscrow')}
          value={formatMoney(persona.inEscrow, persona.homeCurrency, 0)}
          note={t('dashboard.dealsCount', { count: persona.inEscrowDeals })}
        />
        <KpiCard
          icon={ActivityIcon}
          label={t('dashboard.activeDeals')}
          value={String(persona.activeDeals)}
          note={t('dashboard.needAction', { count: persona.dealsNeedingAction })}
          noteTone="warning"
        />
        <KpiCard
          icon={CheckCircle2}
          label={t('dashboard.completed')}
          value={String(persona.dealsDone)}
          note={t('dashboard.completedNote')}
          noteTone="positive"
        />
      </section>

      {/* ── Needs your attention - hidden entirely when there's nothing ── */}
      {attentionCards.length > 0 ? (
        <section>
        <div className="mb-2.5 flex items-center gap-2">
          <Clock className="size-4 text-warning" />
          <h2 className="text-sm font-bold text-ink">{t('dashboard.needsAttention')}</h2>
          <span className="flex size-5 items-center justify-center rounded-full bg-warning-bg text-[11px] font-bold text-warning-text">
            {attentionCards.length}
          </span>
        </div>
        <div className="-mx-4 flex snap-x gap-5 overflow-x-auto px-4 pb-1 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0">
          {attentionCards.map((card) => (
            <AttentionCardView key={card.id} card={card} />
          ))}
        </div>
        </section>
      ) : null}

      {/* ── Desktop split: deals table + chart · donut + activity ── */}
      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          {/* Mobile: heading + separate deal cards */}
          <div className="md:hidden">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-ink">{t('dashboard.activeDeals')}</h2>
              <Link href="/deals" className="text-[13px] font-semibold text-brand-600">
                {t('dashboard.seeAll')}
              </Link>
            </div>
            {activeDeals.length === 0 ? (
              <div className="shadow-card rounded-2xl border border-hairline bg-surface px-4 py-10 text-center">
                <p className="text-sm font-bold text-ink">{t('dashboard.noActiveDeals')}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">{t('dashboard.noActiveDealsSub')}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeDeals.map((deal) => (
                  <ActiveDealRow key={deal.id} deal={deal} />
                ))}
              </div>
            )}
          </div>

          {/* Desktop: table card */}
          <section className="shadow-card hidden rounded-2xl border border-hairline bg-surface md:block">
            <CardHeading
              title={t('dashboard.activeDeals')}
              action={{ label: t('dashboard.seeAll'), href: '/deals' }}
            />
            {activeDeals.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <p className="text-sm font-bold text-ink">{t('dashboard.noActiveDeals')}</p>
                <p className="mt-1 text-[13px] text-muted-foreground">{t('dashboard.noActiveDealsSub')}</p>
              </div>
            ) : (
              <DealsTable deals={activeDeals} />
            )}
          </section>

        </div>

        <div className="hidden space-y-5 lg:block">
          {escrowByDeal.length > 0 ? (
            <section className="shadow-card rounded-2xl border border-hairline bg-surface p-5">
              <h2 className="text-sm font-bold text-ink">{t('dashboard.escrowByDeal')}</h2>
              <DonutChart data={escrowByDeal} className="mt-3" />
            </section>
          ) : null}

          <section className="shadow-card rounded-2xl border border-hairline bg-surface p-2">
            <div className="flex items-center justify-between px-3 py-2">
              <h2 className="text-sm font-bold text-ink">{t('dashboard.activity')}</h2>
              <Link href="/activity" className="text-xs font-semibold text-brand-600">
                {t('dashboard.seeAll')}
              </Link>
            </div>
            {recentActivity.length === 0 ? (
              <p className="px-3 py-6 text-center text-[13px] text-muted-foreground">
                {t('dashboard.noActivity')}
              </p>
            ) : (
              <ul>
                {recentActivity.map((notification) => (
                  <ActivityRow
                    key={notification.id}
                    notification={notification}
                    timeLabel={relativeTime(notification.createdAt, t)}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

/* ── Pieces ─────────────────────────────────────────────────────────────── */

function KpiCard({
  icon: Icon,
  label,
  value,
  note,
  noteTone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  noteTone?: 'warning' | 'positive';
}) {
  return (
    <div className="shadow-card rounded-2xl border border-hairline bg-surface p-4">
      <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
        <Icon className="size-4 text-subtle" /> {label}
      </p>
      <p className="mt-3 text-xl font-extrabold -tracking-[0.5px] text-ink">{value}</p>
      <p
        className={cn(
          'mt-1.5 text-[11px] font-medium',
          noteTone === 'warning' && 'text-warning-text',
          noteTone === 'positive' && 'text-positive-text',
          !noteTone && 'text-muted-foreground',
        )}
      >
        {note}
      </p>
    </div>
  );
}

function CardHeading({
  title,
  action,
}: {
  title: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="flex items-center justify-between px-4 pb-2.5 pt-4 md:px-5">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      {action ? (
        <Link href={action.href} className="text-xs font-semibold text-brand-600">
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}

function ctaClasses(tone: DashboardAttentionCard['ctaTone']): string {
  if (tone === 'positive') return 'bg-positive text-white hover:opacity-95';
  if (tone === 'danger') return 'border border-negative text-negative hover:bg-negative-bg-soft';
  return 'bg-primary text-primary-foreground hover:opacity-95';
}

function AttentionCardView({ card }: { card: DashboardAttentionCard }) {
  const router = useRouter();
  // No left-only accent - the whole card carries the colour: a soft status tint
  // plus a full border in the status colour.
  const cardTone =
    card.tone === 'warning'
      ? 'border-warning bg-warning-bg-soft'
      : card.tone === 'positive'
        ? 'border-positive bg-[#F1FBF4]'
        : 'border-negative bg-negative-bg-soft';
  return (
    <div
      className={cn(
        'shadow-card flex min-w-[255px] flex-1 snap-start flex-col rounded-2xl border-[1.5px] p-3.5 md:min-w-0',
        cardTone,
      )}
    >
      <StatusPill tone={card.tone} className="self-start">
        {card.statusLabel}
      </StatusPill>
      <p className="mt-3 text-[13.5px] font-bold text-ink">{card.title}</p>
      <p className="mt-1 text-[11.5px] text-muted-foreground">{card.meta}</p>
      <p className="mt-2.5 flex-1 text-xs leading-relaxed text-body">{card.nextStep}</p>
      <button
        type="button"
        onClick={() => router.push(card.href)}
        className={cn(
          'mt-4 inline-flex h-9 items-center justify-center rounded-lg px-3 text-xs font-semibold transition',
          ctaClasses(card.ctaTone),
        )}
      >
        {card.cta}
      </button>
    </div>
  );
}

const DEAL_AVATAR_TONE: Record<NonNullable<ActiveDeal['avatarTone']>, string> = {
  brand: 'bg-brand-50 text-brand-700',
  warning: 'bg-warning-bg text-warning-text',
  positive: 'bg-positive-bg text-positive-text',
  neutral: 'bg-muted text-muted-foreground',
};

function DealAvatar({ name, tone = 'brand' }: { name: string; tone?: NonNullable<ActiveDeal['avatarTone']> }) {
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-[10px] text-[11px] font-bold',
        DEAL_AVATAR_TONE[tone],
      )}
    >
      {initials(name)}
    </span>
  );
}

function DealParty({ deal }: { deal: ActiveDeal }) {
  const { t } = useTranslation();
  const relation = deal.relation ? `${t(`deals.rel.${deal.relation}`)} ` : '';
  const detail = deal.detailKey ? ` · ${t(deal.detailKey, deal.detailParams)}` : '';
  return (
    <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
      {relation}
      {deal.counterparty}
      {detail}
    </p>
  );
}

function ActiveDealRow({ deal }: { deal: ActiveDeal }) {
  return (
    <Link
      href="/deals"
      className="shadow-card flex items-center gap-3 rounded-2xl border border-hairline bg-surface p-3.5 transition hover:border-brand-border"
    >
      <DealAvatar name={deal.counterparty} tone={deal.avatarTone} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13.5px] font-bold text-ink">{deal.title}</p>
        <DealParty deal={deal} />
      </div>
      <div className="shrink-0 text-right">
        <p className="text-[13.5px] font-extrabold text-ink">
          {formatMoney(deal.amount, deal.currency, 0)}
        </p>
        <StatusPill tone={statusTone(deal.statusLabel)}>{deal.statusLabel}</StatusPill>
      </div>
    </Link>
  );
}

function DealsTable({ deals }: { deals: ActiveDeal[] }) {
  const { t } = useTranslation();
  return (
    <table className="w-full text-[13px]">
      <thead>
        <tr className="border-y border-hairline text-left text-[10.5px] uppercase tracking-wider text-subtle">
          <th className="px-5 py-2.5 font-bold">{t('dashboard.table.deal')}</th>
          <th className="px-3 py-2.5 font-bold">{t('dashboard.table.escrowValue')}</th>
          <th className="px-3 py-2.5 font-bold">{t('dashboard.table.status')}</th>
          <th className="px-5 py-2.5 font-bold">{t('dashboard.table.nextStep')}</th>
        </tr>
      </thead>
      <tbody>
        {deals.map((deal) => (
          <tr
            key={deal.id}
            className="border-b border-[#F1F5FA] transition last:border-0 hover:bg-[#FBFDFF]"
          >
            <td className="px-5 py-3">
              <div className="flex items-center gap-3">
                <DealAvatar name={deal.counterparty} />
                <div className="min-w-0">
                  <Link
                    href="/deals"
                    className="block truncate text-[13.5px] font-semibold text-ink hover:text-brand-600"
                  >
                    {deal.title}
                  </Link>
                  <DealParty deal={deal} />
                </div>
              </div>
            </td>
            <td className="px-3 py-3">
              <p className="font-semibold text-ink">{formatMoney(deal.amount, deal.currency, 0)}</p>
              {deal.equivalent ? (
                <p className="text-[11px] text-muted-foreground">{deal.equivalent}</p>
              ) : null}
            </td>
            <td className="px-3 py-3">
              <StatusPill tone={statusTone(deal.statusLabel)}>{deal.statusLabel}</StatusPill>
            </td>
            <td className="px-5 py-3">
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-positive-text">
                {deal.nextStep} <ArrowRight className="size-3.5" />
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ActivityRow({ notification, timeLabel }: { notification: AppNotification; timeLabel: string }) {
  const meta = ACTIVITY_ICON[notification.category];
  const unread = !notification.read;
  return (
    <li
      className={cn(
        'flex items-start gap-3 rounded-xl px-3 py-2.5',
        unread && 'bg-[#F8FBFF]',
      )}
    >
      <span className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg', meta.className)}>
        <meta.icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-ink">{notification.title}</p>
        <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {notification.body} · {timeLabel}
        </p>
      </div>
      {unread ? <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-brand-500" /> : null}
    </li>
  );
}
