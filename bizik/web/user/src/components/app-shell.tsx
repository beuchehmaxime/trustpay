import type { ReactNode } from 'react';

import { BottomTabs } from '@/components/shell/bottom-tabs';
import { Sidebar } from '@/components/shell/sidebar';
import { TopBar } from '@/components/shell/topbar';

/**
 * Authenticated app chrome. Responsive per the handoff:
 * - mobile (< md): full-width content + a fixed bottom tab bar (+ FAB)
 * - tablet (md): a 74px icon-rail sidebar
 * - desktop (lg): the full 250px sidebar
 * The top bar shows on md and up; content is capped at 1200px.
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-full">
      <Sidebar />

      <div className="flex min-h-full min-w-0 flex-col md:ml-[74px] lg:ml-[250px]">
        <TopBar />
        {/* Full-width content (px-6 gutters) so it reaches out to the same
            margins as the top bar - not capped/centred. `overflow-x-clip`
            stops full-bleed heros / carousels from letting the page pan
            sideways on mobile (which reads as a stray left margin). */}
        <main className="w-full min-w-0 flex-1 overflow-x-clip px-4 pb-28 pt-4 md:px-6 md:pb-10 md:pt-6">
          {children}
        </main>
      </div>

      <BottomTabs />
    </div>
  );
}
