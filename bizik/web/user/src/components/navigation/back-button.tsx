'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';

/**
 * "Go back" that always goes somewhere.
 *
 * `router.back()` is right when the visitor followed a broken link from another
 * page. But a 404 is often the FIRST page in the tab - a bad link pasted into
 * the address bar, or opened from WhatsApp in a new tab - and then there is no
 * history to return to and a plain back button silently does nothing. In that
 * case this navigates to `fallbackHref` instead.
 *
 * Unstyled on purpose: the marketing site and the app each pass their own classes.
 */
export function BackButton({
  fallbackHref,
  className,
  children,
}: {
  fallbackHref: string;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();

  const goBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button type="button" className={className} onClick={goBack}>
      {children}
    </button>
  );
}
