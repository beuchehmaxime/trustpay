'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Smartphone, X } from 'lucide-react';

const DISMISS_KEY = 'bizik.install-banner-dismissed';

/**
 * Inline "add to home screen" prompt shown on the mobile dashboard. Hidden once
 * dismissed (localStorage) or when already running as an installed PWA.
 */
export function InstallBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(DISMISS_KEY) === '1';
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS Safari
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setVisible(!dismissed && !standalone);
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-brand-border bg-brand-50/60 px-4 py-3 md:hidden">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-600 shadow-sm">
        <Smartphone className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-bold text-brand-700">{t('dashboard.install.title')}</p>
        <p className="text-[12px] text-muted-foreground">{t('dashboard.install.subtitle')}</p>
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('dashboard.install.dismiss')}
        className="flex size-7 shrink-0 items-center justify-center rounded-full text-subtle transition hover:bg-white hover:text-ink"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
