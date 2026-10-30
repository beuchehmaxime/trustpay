'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

import { AppShell } from '@/components/app-shell';
import { AssistantLauncher } from '@/components/assistant/assistant-launcher';
import { Walkthrough } from '@/components/onboarding/walkthrough';
import { useAuthStore } from '@/lib/auth/auth.store';

/**
 * Client-side route guard for the authenticated area. Tokens live in
 * localStorage (unreadable on the server), so protection happens here: while the
 * session is rehydrating we show a spinner; an unauthenticated user is bounced
 * to `/login`.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const hydrated = useAuthStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && status === 'unauthenticated') router.replace('/login');
  }, [hydrated, status, router]);

  if (!hydrated || status !== 'authenticated') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <AppShell>
      {/* Mounted on the shell, not the dashboard, so a new account that lands
          anywhere - a deal invite link, a notification - still gets the tour
          rather than only the people who happen to start on the dashboard. */}
      <Walkthrough />
      {children}
      {/* On the shell rather than a route of its own: the point of an in-app
          assistant is that you can ask it from the screen you are already on,
          with the deal or the balance you are asking about still in view. */}
      <AssistantLauncher />
    </AppShell>
  );
}
