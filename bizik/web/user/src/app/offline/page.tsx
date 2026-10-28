import { WifiOff } from 'lucide-react';

export const metadata = {
  title: 'Offline',
};

/**
 * Offline fallback - served by the service worker when a navigation fails with
 * no network. Kept static and self-contained so it's always precached.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-2xl bg-secondary text-primary">
        <WifiOff className="size-7" />
      </div>
      <h1 className="text-xl font-bold text-ink">You&rsquo;re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        BiZik can&rsquo;t reach the network right now. Check your connection - your
        session and cached pages are still available once you&rsquo;re back online.
      </p>
      <a
        href="/dashboard"
        className="mt-2 inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-sm font-semibold text-primary-foreground"
      >
        Try again
      </a>
    </div>
  );
}
