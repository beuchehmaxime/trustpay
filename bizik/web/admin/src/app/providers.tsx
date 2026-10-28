'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { ThemeProvider } from 'next-themes';

import { getQueryClient } from '@/lib/query/query-client';
import { useAuthStore } from '@/lib/auth/auth.store';
import { GlobalLoadingOverlay } from '@/components/global-loading-overlay';

/** Rehydrates the session from the stored token exactly once on mount. */
function AuthBootstrap({ children }: { children: ReactNode }) {
  const bootstrap = useAuthStore((state) => state.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  return children;
}

/** App-wide client providers: React Query, theming and session bootstrap. */
export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Light theme only - matches the mobile app (no dark mode). */}
      <ThemeProvider attribute="class" forcedTheme="light" disableTransitionOnChange>
        <AuthBootstrap>{children}</AuthBootstrap>
        <GlobalLoadingOverlay />
      </ThemeProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
