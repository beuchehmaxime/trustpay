'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from 'lucide-react';

import { AccountOverview } from '@/components/account/account-overview';
import { StatusPill } from '@/components/ui/status-pill';
import { useAuthStore } from '@/lib/auth/auth.store';
import { useDeals } from '@/lib/hooks/use-deals';
import { usePayoutMethods } from '@/lib/hooks/use-payouts';
import { cn } from '@/lib/utils';

/** Initials from a full name, e.g. "Kwame Mensah" -> "KM". */
function initialsOf(fullName?: string | null): string {
  if (!fullName) return '';
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export default function SettingsHubPage() {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { deals, dealsSummary } = useDeals();
  const payoutMethods = usePayoutMethods();

  const fullName = user?.fullName ?? '';
  const tier = user?.kycTier ?? 0;
  const verified = tier >= 2;

  // Hero meta line: only the parts the account actually has.
  const metaLine = [user?.phone, user?.companyName, user?.country]
    .filter(Boolean)
    .join(' · ');

  // Honest, derived-from-contracts stats (no fake rating / on-time %).
  const completedCount = deals.filter((deal) => deal.status === 'completed').length;
  const stats = [
    { label: t('settings.hero.dealsDone'), value: String(completedCount) },
    { label: t('settings.hero.active'), value: String(dealsSummary.active) },
    { label: t('settings.hero.total'), value: String(deals.length) },
  ];

  const payoutList = payoutMethods.data ?? [];
  const payoutsSub = payoutList.length
    ? payoutList.map((method) => method.name).join(' · ')
    : t('settings.cards.payoutsEmpty');

  const cards = [
    { href: '/settings/personal', title: t('settings.nav.personal'), sub: t('settings.cards.personalSub') },
    {
      href: '/settings/kyc',
      title: t('settings.nav.kyc'),
      sub: t('settings.tierLine', {
        tier,
        status: verified ? t('settings.verified') : t('settings.notVerified'),
      }),
      verified,
    },
    { href: '/settings/security', title: t('settings.nav.security'), sub: t('settings.cards.securitySub') },
    {
      href: '/settings/payouts',
      title: t('settings.nav.payouts'),
      sub: payoutsSub,
    },
  ];

  return (
    <>
      {/* Mobile / tablet: the same account overview design as the Profile tab. */}
      <div className="lg:hidden">
        <AccountOverview />
      </div>

      {/* Desktop: the settings landing pane shown beside the nav rail. */}
      <div className="hidden space-y-4 lg:block">
      {/* Hero */}
      <div className="bg-hero-gradient shadow-brand flex flex-wrap items-center justify-between gap-5 rounded-3xl p-6 text-white">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-white/20 text-lg font-extrabold">
            {initialsOf(fullName)}
          </span>
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold tracking-[-0.3px]">{fullName}</h2>
            <p className="truncate text-[13px] text-white/85">{metaLine}</p>
          </div>
        </div>
        <div className="flex gap-2.5">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white/15 px-4 py-2.5 text-center">
              <p className="text-[11px] font-medium text-white/80">{stat.label}</p>
              <p className="text-lg font-extrabold">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className={cn(
              'shadow-card group rounded-2xl border border-hairline bg-surface p-5 transition',
              'hover:border-brand-border hover:shadow-[0_16px_36px_-18px_rgba(11,31,58,0.25)]',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-bold text-ink">{card.title}</h3>
                {card.verified ? (
                  <StatusPill tone="positive">{t('settings.verified')}</StatusPill>
                ) : null}
              </div>
              <ChevronRight className="size-4 text-subtle transition group-hover:translate-x-0.5" />
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted-foreground">{card.sub}</p>
          </Link>
        ))}
      </div>
      </div>
    </>
  );
}
