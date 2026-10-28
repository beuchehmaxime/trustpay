'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, WifiOff } from 'lucide-react';

/**
 * Full-screen offline state shown across the entire app whenever the browser
 * reports no connectivity. Cached (already-visited) pages remain in the router
 * cache / service worker, so the copy reassures the user their data is safe.
 */
export function OfflineOverlay() {
  const { t } = useTranslation();
  const [offline, setOffline] = useState(false);

  const sync = useCallback(() => {
    if (typeof navigator !== 'undefined') setOffline(!navigator.onLine);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    // Re-check on resume too. A phone that loses and regains its connection
    // while the app is frozen does not reliably fire `online`, which would
    // leave this overlay covering a working app until something else nudged it.
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [sync]);

  if (!offline) return null;

  return (
    <div className="bg-background fixed inset-0 z-[200] flex flex-col items-center justify-center px-8 text-center">
      <span className="flex size-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <WifiOff className="size-8" />
      </span>
      <h1 className="mt-5 text-2xl font-extrabold text-ink">{t('offline.title')}</h1>
      <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-muted-foreground">
        {t('offline.subtitle')}
      </p>
      <button
        type="button"
        onClick={sync}
        className="bg-primary shadow-brand mt-5 h-12 rounded-xl px-9 text-[15px] font-semibold text-white transition hover:opacity-95"
      >
        {t('offline.retry')}
      </button>
      <span className="shadow-card mt-4 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface px-4 py-2.5 text-[13px] font-semibold text-ink">
        <Check className="size-4 text-positive" strokeWidth={3} />
        {t('offline.cached')}
      </span>
    </div>
  );
}
