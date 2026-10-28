import type { ReactNode } from 'react';

import { SettingsNav } from '@/components/settings/settings-nav';

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex w-full flex-col gap-6 lg:flex-row lg:items-start">
      {/* Desktop-only settings rail; on mobile the hub renders its own menu. */}
      <div className="hidden lg:block">
        <SettingsNav />
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
