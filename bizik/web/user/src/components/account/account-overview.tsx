'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  ChevronRight,
  CreditCard,
  Globe,
  HelpCircle,
  IdCard,
  Lock,
  ShieldCheck,
  User,
  type LucideIcon,
} from 'lucide-react';

import { StatusPill } from '@/components/ui/status-pill';
import { useAuthStore } from '@/lib/auth/auth.store';
import { useDeals } from '@/lib/hooks/use-deals';

function initials(fullName?: string | null): string {
  if (!fullName) return '';
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * The account / settings overview: gradient hero + grouped menu lists.
 * Shared by the mobile Profile tab (`/profile`) and the mobile Settings
 * screen (`/settings`), which present the same design.
 */
export function AccountOverview() {
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { deals, dealsSummary } = useDeals();

  const name = user?.fullName ?? '';
  const phone = user?.phone ?? user?.email ?? '';
  const tier = user?.kycTier ?? 0;
  const verified = tier >= 2;
  const langLabel = i18n.language?.startsWith('fr') ? t('lang.fr') : t('lang.en');

  // Honest, derived-from-contracts stats (no fake rating / on-time %).
  const completedCount = deals.filter((deal) => deal.status === 'completed').length;
  const stats = [
    { label: t('settings.hero.dealsDone'), value: String(completedCount) },
    { label: t('settings.hero.active'), value: String(dealsSummary.active) },
    { label: t('settings.hero.total'), value: String(deals.length) },
  ];

  async function onLogout() {
    await logout();
    router.replace('/login');
  }

  return (
    <div className="mx-auto w-full max-w-[560px] space-y-4">
      {/* Hero - full-bleed on mobile (no top/left/right margin), inset card on desktop */}
      <section className="bg-hero-gradient shadow-card -mx-4 -mt-4 rounded-b-[28px] px-5 pb-6 pt-6 text-white md:mx-0 md:mt-0 md:rounded-3xl md:p-5">
        <div className="flex items-center gap-3.5">
          <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white text-lg font-extrabold text-brand-700">
            {initials(name)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-xl font-extrabold">{name}</h1>
            <p className="truncate text-[13px] text-white/85">{phone}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {verified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-positive-text">
                  <ShieldCheck className="size-3.5" />
                  {t('settings.verified')}
                </span>
              ) : null}
              <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                Tier {tier}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl bg-white/12 px-3 py-2.5">
              <p className="text-[11px] text-white/75">{stat.label}</p>
              <p className="mt-0.5 text-lg font-extrabold">{stat.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Account & security */}
      <div className="shadow-card divide-y divide-[#F1F5FA] overflow-hidden rounded-2xl border border-hairline bg-surface">
        <MenuRow icon={User} label={t('settings.nav.personal')} href="/settings/personal" />
        <MenuRow
          icon={IdCard}
          label={t('settings.nav.kyc')}
          href="/settings/kyc"
          badge={verified ? t('settings.verified') : undefined}
        />
        <MenuRow icon={Lock} label={t('settings.nav.security')} href="/settings/security" />
        <MenuRow icon={CreditCard} label={t('settings.nav.payouts')} href="/settings/payouts" />
      </div>

      {/* Preferences */}
      <div className="shadow-card divide-y divide-[#F1F5FA] overflow-hidden rounded-2xl border border-hairline bg-surface">
        <MenuRow icon={Globe} label={t('settings.nav.language')} href="/settings/language" value={langLabel} />
        <MenuRow icon={HelpCircle} label={t('support.title')} href="/support" />
      </div>

      {/* Sign out */}
      <button
        type="button"
        onClick={onLogout}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-negative bg-surface py-3.5 text-sm font-semibold text-negative transition hover:bg-negative-bg-soft"
      >
        {t('profile.signOut')}
      </button>
    </div>
  );
}

function MenuRow({
  icon: Icon,
  label,
  href,
  badge,
  value,
}: {
  icon: LucideIcon;
  label: string;
  href: string;
  badge?: string;
  value?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-muted/40">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="size-[18px]" />
      </span>
      <span className="flex-1 text-[14px] font-semibold text-body">{label}</span>
      {badge ? <StatusPill tone="positive">{badge}</StatusPill> : null}
      {value ? <span className="text-[13px] text-muted-foreground">{value}</span> : null}
      <ChevronRight className="size-4 shrink-0 text-subtle" />
    </Link>
  );
}
