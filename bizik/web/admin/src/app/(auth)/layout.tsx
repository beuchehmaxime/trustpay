import type { ReactNode } from 'react';

import { AdminBrandPanel } from '@/components/auth/brand-panel';

/** Split-screen admin auth shell: brand panel on the left, the form on the right. */
export default function AuthLayout({ children }: { children: ReactNode }) {
  const year = new Date().getFullYear();

  return (
    <div className="grid min-h-svh flex-1 lg:grid-cols-2">
      <AdminBrandPanel />

      <div className="flex flex-1 flex-col bg-surface">
        <div className="flex items-center gap-2 px-5 py-4 lg:hidden">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
            Q
          </span>
          <span className="font-bold text-ink">
            BiZik <span className="font-medium text-muted-foreground">Admin</span>
          </span>
        </div>

        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
          <div className="w-full max-w-[400px]">{children}</div>
        </div>

        <footer className="border-t border-hairline px-4 py-4 sm:px-8">
          <div className="mx-auto flex w-full max-w-[400px] flex-col items-center justify-between gap-2 text-xs text-muted-foreground sm:flex-row">
            <span>© {year} BiZik · Admin console</span>
            <div className="flex items-center gap-3">
              <a
                href="mailto:support@bizik.cm"
                className="transition-colors hover:text-ink"
              >
                Support
              </a>
              <span className="text-muted-foreground/40">•</span>
              <span>v1.0</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
