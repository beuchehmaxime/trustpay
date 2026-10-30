'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';

import { assistantApi } from '@/lib/api/assistant.api';
import { cn } from '@/lib/utils';
import { AssistantPanel } from './assistant-panel';

/**
 * The button that opens the assistant, mounted on the app shell.
 *
 * It asks the backend whether the assistant is configured before showing
 * itself. Without a model key the panel would open and every message would
 * fail, and an entry point that leads nowhere is worse than no entry point.
 *
 * Positioned clear of the bottom tab bar on phones - the tabs are the primary
 * navigation and this must never sit on top of them.
 */
export function AssistantLauncher() {
  const { t } = useTranslation();
  const [available, setAvailable] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    assistantApi
      .status()
      .then((status) => {
        if (!cancelled) setAvailable(status.available);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={t('assistant.open')}
          className={cn(
            'fixed z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-lg transition-transform',
            'hover:scale-[1.03] active:scale-95',
            'bottom-24 right-4 md:bottom-6 md:right-6',
          )}
        >
          <Sparkles className="size-4" />
          <span className="hidden sm:inline">{t('assistant.open')}</span>
        </button>
      )}
      <AssistantPanel open={open} onClose={() => setOpen(false)} />
    </>
  );
}
