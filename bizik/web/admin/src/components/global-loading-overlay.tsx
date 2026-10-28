'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';

import { loadingBus } from '@/lib/api/loading';

/**
 * A full-screen blocking overlay shown whenever any request to the backend is
 * in flight. It sits above every other layer (including dialogs) so the user
 * cannot interact with the app until the current operation completes.
 *
 * A short show-delay keeps very fast requests from flashing the overlay.
 */
export function GlobalLoadingOverlay() {
  const loading = useSyncExternalStore(
    loadingBus.subscribe,
    loadingBus.isLoading,
    () => false,
  );
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Show after a short delay (so fast requests don't flash); hide promptly.
    const timeout = setTimeout(() => setVisible(loading), loading ? 120 : 0);
    return () => clearTimeout(timeout);
  }, [loading]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-200 flex items-center justify-center bg-ink/30 backdrop-blur-sm"
    >
      <div className="flex w-64 max-w-[80vw] flex-col items-center gap-5 rounded-lg bg-white px-8 py-9 shadow-2xl ring-1 ring-black/5">
        <span
          aria-hidden
          className="size-11 animate-spin rounded-full border-[3px] border-brand-500/20 border-t-brand-500"
        />
        <div className="text-center">
          <p className="font-heading text-sm font-bold tracking-[0.3em] text-ink">BiZik</p>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-sm text-muted-foreground">
            Processing
            <span className="inline-flex gap-1">
              {[0, 150, 300].map((delay) => (
                <span
                  key={delay}
                  className="size-1.5 animate-bounce rounded-full bg-brand-500/70"
                  style={{ animationDelay: `${delay}ms` }}
                />
              ))}
            </span>
          </p>
        </div>
      </div>
      <span className="sr-only">Loading, please wait…</span>
    </div>
  );
}
