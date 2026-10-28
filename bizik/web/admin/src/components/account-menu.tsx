'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, LogOut, UserRound } from 'lucide-react';

import { cn } from '@/lib/utils';
import { initials } from '@/lib/avatar';
import { useAuthStore } from '@/lib/auth/auth.store';

/**
 * Top-bar account menu: the signed-in operator's name/avatar opens a modern
 * dropdown with a profile link and a sign-out action.
 */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const roleLabel = user?.isSuperAdmin ? 'Super Admin' : user?.adminRole?.name;

  async function onLogout() {
    setOpen(false);
    await logout();
    router.replace('/login');
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'flex items-center gap-2.5 rounded-lg py-1 pr-1.5 pl-2 transition-colors hover:bg-muted',
          open && 'bg-muted',
        )}
      >
        <div className="hidden text-right leading-tight sm:block">
          <p className="text-sm font-semibold text-ink">{user?.fullName ?? 'Account'}</p>
          <p className="max-w-[180px] truncate text-xs text-muted-foreground">{user?.email}</p>
        </div>
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">
          {initials(user?.fullName ?? 'Account')}
        </span>
        <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-hairline bg-surface shadow-xl">
            <div className="flex items-center gap-3 border-b border-hairline p-4">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-sm font-bold text-white">
                {initials(user?.fullName ?? 'Account')}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{user?.fullName ?? 'Account'}</p>
                <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                {roleLabel ? (
                  <span className="mt-1 inline-block rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-700 uppercase">
                    {roleLabel}
                  </span>
                ) : null}
              </div>
            </div>
            <div className="p-1.5">
              <Link
                href="/profile"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-muted"
              >
                <UserRound className="size-4 text-muted-foreground" /> Profile
              </Link>
              <button
                type="button"
                onClick={onLogout}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="size-4" /> Sign out
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
