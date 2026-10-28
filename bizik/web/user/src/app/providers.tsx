'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';
import { I18nextProvider } from 'react-i18next';

import { getQueryClient } from '@/lib/query/query-client';
import { useAuthStore } from '@/lib/auth/auth.store';
import { OfflineOverlay } from '@/components/offline/offline-overlay';
import { ProcessingOverlay } from '@/components/processing-overlay';
import i18n from '@/lib/i18n';

/**
 * Rehydrates the session on mount, and again if the app comes back to the
 * foreground still waiting.
 *
 * An installed PWA is frozen by the OS when backgrounded, and its sockets can
 * be torn down while it sleeps. A request that was in flight at that moment
 * never completes and never fails, so a single mount-time bootstrap could sit
 * unresolved for ever - holding the whole app behind its loading gate until the
 * person force-quit it. Retrying on resume gives it a live connection to try
 * again on, and `bootstrap` ignores the call if it is already hydrated or still
 * running, so this is free when everything is working.
 */
function AuthBootstrap({ children }: { children: ReactNode }) {
  const bootstrap = useAuthStore((authState) => authState.bootstrap);

  useEffect(() => {
    void bootstrap();

    const retryIfStalled = () => {
      if (document.visibilityState !== 'visible') return;
      if (useAuthStore.getState().hydrated) return;
      void bootstrap();
    };

    document.addEventListener('visibilitychange', retryIfStalled);
    // `pageshow` fires when the page is restored from the back/forward cache,
    // which `visibilitychange` does not always cover.
    window.addEventListener('pageshow', retryIfStalled);
    return () => {
      document.removeEventListener('visibilitychange', retryIfStalled);
      window.removeEventListener('pageshow', retryIfStalled);
    };
  }, [bootstrap]);

  return children;
}

/** App-wide client providers: React Query, theming and session bootstrap. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        {/* Light theme only - matches the mobile app (no dark mode). */}
        <ThemeProvider attribute="class" forcedTheme="light" disableTransitionOnChange>
          <AuthBootstrap>{children}</AuthBootstrap>
        </ThemeProvider>
        <ProcessingOverlay />
        <OfflineOverlay />
      </I18nextProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
