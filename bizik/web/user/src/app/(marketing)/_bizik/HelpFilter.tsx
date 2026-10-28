'use client';

import { useEffect } from 'react';

/**
 * Help-centre index behaviour, ported from the design's inline script: live
 * search over article text plus topic tabs, kept in sync with the URL hash and
 * the "popular" chips. Progressive - the article grid renders fully server-side;
 * this only filters it. Renders nothing.
 */
export function HelpFilter() {
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>('[data-help-query]');
    const tabs = Array.from(document.querySelectorAll<HTMLElement>('[data-help-topic][role="tab"]'));
    const items = Array.from(document.querySelectorAll<HTMLElement>('[data-help-item]'));
    const empty = document.querySelector<HTMLElement>('[data-help-empty]');
    if (!input || !tabs.length) return;

    let topic = 'all';

    const apply = () => {
      const query = input.value.trim().toLowerCase();
      let hits = 0;
      items.forEach((item) => {
        const okTopic = topic === 'all' || item.getAttribute('data-help-topic') === topic;
        const okText = !query || (item.getAttribute('data-help-text') || '').indexOf(query) > -1;
        const show = okTopic && okText;
        item.hidden = !show;
        if (show) hits += 1;
      });
      if (empty) empty.hidden = hits > 0;
    };

    const select = (slug: string, pushHash: boolean) => {
      topic = slug;
      tabs.forEach((tab) => {
        const on = tab.getAttribute('data-help-topic') === slug;
        tab.classList.toggle('is-active', on);
        tab.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (pushHash && history.replaceState) {
        history.replaceState(null, '', slug === 'all' ? location.pathname : `#topic-${slug}`);
      }
      apply();
    };

    const tabHandlers = tabs.map((tab) => {
      const handler = (event: Event) => {
        event.preventDefault();
        select(tab.getAttribute('data-help-topic') || 'all', true);
      };
      tab.addEventListener('click', handler);
      return { tab, handler };
    });

    input.addEventListener('input', apply);

    const chips = Array.from(document.querySelectorAll<HTMLElement>('[data-help-chip]'));
    const chipHandlers = chips.map((chip) => {
      const handler = () => {
        input.value = chip.getAttribute('data-help-chip') || '';
        select('all', true);
        input.focus();
      };
      chip.addEventListener('click', handler);
      return { chip, handler };
    });

    const match = location.hash.match(/^#topic-([a-z0-9-]+)$/);
    if (match && tabs.some((tab) => tab.getAttribute('data-help-topic') === match[1])) {
      select(match[1], false);
      document.querySelector('[data-help-scope]')?.scrollIntoView();
    }

    return () => {
      tabHandlers.forEach(({ tab, handler }) => tab.removeEventListener('click', handler));
      chipHandlers.forEach(({ chip, handler }) => chip.removeEventListener('click', handler));
      input.removeEventListener('input', apply);
    };
  }, []);

  return null;
}
