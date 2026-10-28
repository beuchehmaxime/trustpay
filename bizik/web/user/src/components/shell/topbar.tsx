'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  Check,
  ChevronDown,
  ChevronRight,
  Globe,
  LogOut,
  User as UserIcon,
  Wallet,
} from 'lucide-react';

import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuthStore } from '@/lib/auth/auth.store';
import { useUnreadCount } from '@/lib/hooks/use-notifications';
import { useWallet } from '@/lib/hooks/use-wallet';
import { formatMoney } from '@/lib/format';
import { setAppLanguage, LANGUAGES } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { groupKeyForPath, titleKeyForPath } from './nav';

/** Shared modern dropdown panel: soft layered elevation + smooth entrance. */
const PANEL_CLASS =
  'absolute right-0 top-full z-50 mt-2.5 origin-top-right rounded-[22px] border border-hairline/70 bg-surface p-2 ' +
  'shadow-[0_24px_56px_-12px_rgba(11,31,58,0.30)] ring-1 ring-[rgba(11,31,58,0.04)] ' +
  'animate-in fade-in-0 zoom-in-95 slide-in-from-top-1 duration-150 ease-out';

function initials(name?: string | null): string {
  if (!name) return 'Q';
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

/**
 * Desktop / tablet top bar: breadcrumb + page title on the left; wallet chip,
 * language menu, notifications bell and the user menu on the right. Hidden on
 * mobile (the mobile hero carries the bell + avatar).
 */
export function TopBar() {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { walletBalance, homeCurrency } = useWallet();
  const unreadCountQuery = useUnreadCount();
  const unreadCount = unreadCountQuery.data ?? 0;

  return (
    <header className="bg-background/85 sticky top-0 z-30 hidden h-16 items-center justify-between gap-4 border-b border-hairline px-6 backdrop-blur md:flex">
      <div className="min-w-0">
        <p className="text-[10.5px] font-bold uppercase tracking-wider text-subtle">
          {t(groupKeyForPath(pathname))}
        </p>
        <h1 className="truncate text-base font-bold tracking-[-0.3px] text-ink">
          {t(titleKeyForPath(pathname))}
        </h1>
      </div>

      <div className="flex items-center gap-2.5">
        <Link
          href="/wallet"
          className="hidden items-center gap-2 rounded-full border border-hairline bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink transition hover:border-brand-border sm:flex"
        >
          <Wallet className="size-4 text-brand-600" />
          {formatMoney(walletBalance, homeCurrency)}
          <span className="text-[11px] font-medium text-muted-foreground">
            {homeCurrency}
          </span>
        </Link>

        <LanguageMenu />

        <Link
          href="/activity"
          aria-label="Notifications"
          className="relative flex size-10 items-center justify-center rounded-full border border-hairline bg-surface text-muted-foreground transition hover:border-brand-border hover:text-ink"
        >
          <Bell className="size-5" />
          {unreadCount > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-negative px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-surface tabular-nums">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          ) : null}
        </Link>

        <UserMenu />
      </div>
    </header>
  );
}

/** Minimal, self-contained dropdown (no portal) - a toggle + click-outside. */
function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { open, setOpen, ref };
}

function LanguageMenu() {
  const { open, setOpen, ref } = useDropdown();
  const { t, i18n } = useTranslation();
  const current = i18n.language?.startsWith('fr') ? 'fr' : 'en';

  function choose(code: 'en' | 'fr') {
    setAppLanguage(code);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-3 py-2 text-[13px] font-semibold text-ink transition hover:border-brand-border"
      >
        <Globe className="size-4 text-muted-foreground" />
        {current.toUpperCase()}
        <ChevronDown className={cn('size-3.5 text-muted-foreground transition', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className={cn(PANEL_CLASS, 'w-56')}>
          <p className="px-2.5 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-subtle">
            {t('lang.title')}
          </p>
          {LANGUAGES.map((code) => {
            const active = current === code;
            return (
              <button
                key={code}
                type="button"
                onClick={() => choose(code)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2.5 text-[14px] transition',
                  active ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-muted',
                )}
              >
                <span
                  className={cn(
                    'flex size-8 items-center justify-center rounded-xl text-[11px] font-bold',
                    active ? 'bg-brand-600 text-white' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {code.toUpperCase()}
                </span>
                <span className="flex-1 text-left font-medium">{t(`lang.${code}`)}</span>
                {active ? <Check className="size-4 text-brand-600" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function UserMenu() {
  const { open, setOpen, ref } = useDropdown();
  const { t } = useTranslation();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);

  function goSettings() {
    setOpen(false);
    router.push('/settings');
  }

  async function onLogout() {
    setOpen(false);
    await logout();
    router.replace('/login');
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2 rounded-full border border-hairline bg-surface py-1 pl-1 pr-2.5 transition hover:border-brand-border"
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-brand-50 text-xs font-semibold text-brand-700">
            {initials(user?.fullName)}
          </AvatarFallback>
        </Avatar>
        <span className="hidden max-w-36 truncate text-[13px] font-semibold text-ink lg:inline">
          {user?.fullName ?? 'Account'}
        </span>
        <ChevronDown className={cn('size-3.5 text-muted-foreground transition', open && 'rotate-180')} />
      </button>

      {open ? (
        <div className={cn(PANEL_CLASS, 'w-72')}>
          <div className="flex items-center gap-3 rounded-2xl bg-[#F7FAFF] px-3 py-3">
            <Avatar className="size-11">
              <AvatarFallback className="bg-brand-100 text-[15px] font-bold text-brand-700">
                {initials(user?.fullName)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-ink">{user?.fullName ?? 'Account'}</p>
              <p className="truncate text-[13px] text-muted-foreground">{user?.phone ?? user?.email}</p>
            </div>
          </div>
          <div className="mx-1 my-1.5 h-px bg-hairline" />
          <button
            type="button"
            onClick={goSettings}
            className="group flex w-full items-center gap-3 rounded-2xl px-2.5 py-3 text-[14px] font-medium text-ink transition hover:bg-muted"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
              <UserIcon className="size-[18px]" />
            </span>
            {t('user.profile')}
            <ChevronRight className="ml-auto size-4 text-subtle transition group-hover:translate-x-0.5" />
          </button>
          <button
            type="button"
            onClick={onLogout}
            className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-3 text-[14px] font-medium text-negative transition hover:bg-negative-bg-soft"
          >
            <span className="flex size-9 items-center justify-center rounded-xl bg-negative-bg text-negative">
              <LogOut className="size-[18px]" />
            </span>
            {t('user.signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}
