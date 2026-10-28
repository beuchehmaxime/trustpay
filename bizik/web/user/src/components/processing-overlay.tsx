'use client';

import { useEffect, useState } from 'react';
import { useIsMutating } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';

/**
 * Full-screen blocking overlay shown whenever a mutation (deposit, withdraw,
 * accept, submit, …) is in flight. It sits above everything and captures all
 * pointer events, so the user can't take another action until the request
 * completes. Reads (queries) keep their own inline loading - only writes block.
 *
 * A mutation can opt out of the block with `meta: { silent: true }` (e.g. a
 * background "mark as read").
 */
export function ProcessingOverlay() {
  const pendingMutations = useIsMutating({
    predicate: (mutation) => !(mutation.options.meta as { silent?: boolean } | undefined)?.silent,
  });
  const { t } = useTranslation();

  // Show only after a short delay so very fast mutations don't flash the block.
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!pendingMutations) {
      setVisible(false);
      return;
    }
    const showTimer = setTimeout(() => setVisible(true), 150);
    return () => clearTimeout(showTimer);
  }, [pendingMutations]);

  if (!visible) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-ink/40 backdrop-blur-[1px]"
    >
      <div className="flex w-56 max-w-[80vw] flex-col items-center gap-4 rounded-2xl bg-surface px-8 py-8 shadow-2xl ring-1 ring-black/5">
        <span
          aria-hidden
          className="size-10 animate-spin rounded-full border-[3px] border-brand-500/20 border-t-brand-500"
        />
        <p className="text-[13px] font-medium text-muted-foreground">
          {t('common.processing', { defaultValue: 'Processing…' })}
        </p>
      </div>
      <span className="sr-only">Processing, please wait…</span>
    </div>
  );
}
