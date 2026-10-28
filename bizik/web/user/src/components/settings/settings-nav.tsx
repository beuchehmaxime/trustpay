'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';

import { useAuthStore } from '@/lib/auth/auth.store';
import { cn } from '@/lib/utils';

const ITEMS = [
  { key: 'personal', href: '/settings/personal' },
  { key: 'kyc', href: '/settings/kyc' },
  { key: 'security', href: '/settings/security' },
  { key: 'payouts', href: '/settings/payouts' },
  { key: 'language', href: '/settings/language' },
] as const;

function initialsOf(fullName?: string | null): string {
  if (!fullName) return '';
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function SettingsNav() {
  const pathname = usePathname();
  const { t, i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const lang = i18n.language?.startsWith('fr') ? 'FR' : 'EN';

  const fullName = user?.fullName ?? '';
  const tier = user?.kycTier ?? 0;
  const verified = tier >= 2;

  return (
    <aside className="shadow-card w-full shrink-0 rounded-2xl border border-hairline bg-surface p-3 lg:w-[300px]">
      {/* Profile card */}
      <Link
        href="/settings"
        className={cn(
          'flex items-center gap-3 rounded-xl px-2.5 py-2.5 transition',
          pathname === '/settings' ? 'bg-brand-50' : 'hover:bg-muted',
        )}
      >
        <span className="flex size-10 items-center justify-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-700">
          {initialsOf(fullName)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-[14px] font-bold text-ink">{fullName}</p>
          <p className="truncate text-[11.5px] text-muted-foreground">
            {t('settings.tierLine', {
              tier,
              status: verified ? t('settings.verified') : t('settings.notVerified'),
            })}
          </p>
        </div>
      </Link>

      <div className="my-2 h-px bg-hairline" />

      {/* Links */}
      <nav className="space-y-1">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                'flex items-center justify-between rounded-xl px-3 py-2.5 text-[13.5px] font-semibold transition',
                active ? 'bg-brand-50 text-brand-700' : 'text-muted-foreground hover:bg-muted hover:text-ink',
              )}
            >
              <span>{t(`settings.nav.${item.key}`)}</span>
              {item.key === 'language' ? <span className="text-[11.5px] text-subtle">· {lang}</span> : null}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
