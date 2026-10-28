'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { AppShell } from '@/components/app-shell';
import { useAuthStore } from '@/lib/auth/auth.store';
import { isPrivileged } from '@/lib/auth/roles';

/**
 * Client-side guard for the admin area. Tokens live in localStorage (unreadable
 * on the server), so protection happens here: unauthenticated users are bounced
 * to `/login`, and an authenticated-but-unprivileged session (e.g. a normal
 * client whose token was restored) is signed out - defence in depth on top of
 * the backend role guard.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((state) => state.status);
  const hydrated = useAuthStore((state) => state.hydrated);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  useEffect(() => {
    if (!hydrated) return;
    if (status === 'unauthenticated') {
      router.replace('/login');
    } else if (status === 'authenticated' && !isPrivileged(user?.role)) {
      void logout().then(() => router.replace('/login'));
    }
  }, [hydrated, status, user?.role, logout, router]);

  const authorized = status === 'authenticated' && isPrivileged(user?.role);

  if (!hydrated || !authorized) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
