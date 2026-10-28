'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

import { flushOnHide, trackPageView } from '@/lib/analytics/tracker';

/**
 * Records a page view on every route change.
 *
 * Mounted once in the root layout. In an App Router app a navigation does not
 * reload the page, so nothing fires on its own - without this, every visit
 * would look like a single page view of whatever the person landed on, and the
 * "where do they leave" question could never be answered.
 *
 * Renders nothing and never blocks: if storage is unavailable or the visitor
 * has Do Not Track set, the tracker simply does nothing.
 */
export function AnalyticsTracker() {
  const pathname = usePathname();

  useEffect(() => {
    flushOnHide();
  }, []);

  useEffect(() => {
    if (!pathname) return;
    // Query strings are deliberately dropped: they carry reset tokens, phone
    // numbers and deal ids, none of which belong in an analytics table.
    trackPageView(pathname);
  }, [pathname]);

  return null;
}
