'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Progressive front-end behaviour for the Bizik site, ported from the design's
 * vanilla main.js: sticky-header shadow, mobile-nav drawer, FAQ accordions,
 * scroll reveals, fee calculators, help-centre search and article TOC. Every
 * page works without this; it only enhances. Re-runs on client navigation so
 * newly-rendered sections get wired up.
 */
export function BizikScripts() {
  const pathname = usePathname();

  useEffect(() => {
    const cleanups: Array<() => void> = [];
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- Sticky header shadow ----
    const header = document.getElementById('q-header');
    if (header) {
      const onScroll = () => header.classList.toggle('is-stuck', window.scrollY > 8);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      cleanups.push(() => window.removeEventListener('scroll', onScroll));
    }

    // ---- Mobile nav drawer ----
    const burger = document.querySelector<HTMLButtonElement>('.q-burger');
    const drawer = document.getElementById('q-mobile-nav');
    if (burger && drawer) {
      const setOpen = (open: boolean) => {
        burger.setAttribute('aria-expanded', open ? 'true' : 'false');
        drawer.classList.toggle('is-open', open);
        document.body.classList.toggle('q-nav-open', open);
      };
      const onBurger = () => setOpen(burger.getAttribute('aria-expanded') !== 'true');
      const onDrawer = (event: MouseEvent) => {
        if ((event.target as HTMLElement).closest('a')) setOpen(false);
      };
      const onKey = (event: KeyboardEvent) => {
        if (event.key === 'Escape') setOpen(false);
      };
      const onResize = () => {
        if (window.innerWidth > 1024) setOpen(false);
      };
      burger.addEventListener('click', onBurger);
      drawer.addEventListener('click', onDrawer);
      document.addEventListener('keydown', onKey);
      window.addEventListener('resize', onResize);
      cleanups.push(() => {
        burger.removeEventListener('click', onBurger);
        drawer.removeEventListener('click', onDrawer);
        document.removeEventListener('keydown', onKey);
        window.removeEventListener('resize', onResize);
        setOpen(false);
      });
    }

    // ---- FAQ accordions ----
    document.querySelectorAll<HTMLButtonElement>('.q-faq__q').forEach((btn) => {
      const onClick = () => {
        const item = btn.closest('.q-faq__item');
        const open = btn.getAttribute('aria-expanded') === 'true';
        const group = btn.closest('.q-faq');
        if (group && group.hasAttribute('data-faq-single') && !open) {
          group.querySelectorAll('.q-faq__item.is-open').forEach((other) => {
            other.classList.remove('is-open');
            other.querySelector('.q-faq__q')?.setAttribute('aria-expanded', 'false');
          });
        }
        btn.setAttribute('aria-expanded', open ? 'false' : 'true');
        item?.classList.toggle('is-open', !open);
      };
      btn.addEventListener('click', onClick);
      cleanups.push(() => btn.removeEventListener('click', onClick));
    });

    // ---- Scroll reveals ----
    const reveals = document.querySelectorAll<HTMLElement>('.q-reveal');
    if (reveals.length) {
      if (reduceMotion || !('IntersectionObserver' in window)) {
        reveals.forEach((el) => el.classList.add('is-visible'));
      } else {
        const io = new IntersectionObserver(
          (entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting) {
                entry.target.classList.add('is-visible');
                io.unobserve(entry.target);
              }
            });
          },
          { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
        );
        reveals.forEach((el) => io.observe(el));
        cleanups.push(() => io.disconnect());
      }
    }

    // ---- Fee calculator ----
    const ZERO_DECIMAL = ['XAF', 'XOF', 'NGN', 'GHS', 'JPY'];
    const fmt = (amount: number, currency: string) => {
      const decimals = ZERO_DECIMAL.includes(currency) ? 0 : 2;
      try {
        return (
          new Intl.NumberFormat('en', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals,
          }).format(amount) +
          ' ' +
          currency
        );
      } catch {
        return amount.toFixed(decimals) + ' ' + currency;
      }
    };
    document.querySelectorAll<HTMLElement>('[data-qatiqa-calc]').forEach((root) => {
      const amountEl = root.querySelector<HTMLInputElement>('[data-calc-amount]');
      const currencyEl = root.querySelector<HTMLSelectElement>('[data-calc-currency]');
      const feeEl = root.querySelector<HTMLElement>('[data-calc-fee]');
      const buyerEl = root.querySelector<HTMLElement>('[data-calc-buyer]');
      const sellerEl = root.querySelector<HTMLElement>('[data-calc-seller]');
      const baseEl = root.querySelector<HTMLElement>('[data-calc-base]');
      const clientPct = Number(root.getAttribute('data-fee-client') || '0');
      const sellerPct = Number(root.getAttribute('data-fee-seller') || '0');
      if (!amountEl) return;
      const render = () => {
        const amount = parseFloat(amountEl.value) || 0;
        const currency = currencyEl ? currencyEl.value : 'XAF';
        const buyerFee = amount * (clientPct / 100);
        const sellerFee = amount * (sellerPct / 100);
        if (baseEl) baseEl.textContent = fmt(amount, currency);
        if (feeEl) feeEl.textContent = fmt(buyerFee, currency);
        if (buyerEl) buyerEl.textContent = fmt(amount + buyerFee, currency);
        if (sellerEl) sellerEl.textContent = fmt(amount - sellerFee, currency);
      };
      amountEl.addEventListener('input', render);
      currencyEl?.addEventListener('change', render);
      render();
    });

    // ---- Help centre search ----
    const input = document.querySelector<HTMLInputElement>('[data-help-search]');
    if (input) {
      const scope = document.querySelector<HTMLElement>('[data-help-scope]') || document;
      const items = scope.querySelectorAll<HTMLElement>('[data-help-item]');
      const empty = document.querySelector<HTMLElement>('[data-help-empty]');
      const onInput = () => {
        const term = input.value.trim().toLowerCase();
        let hits = 0;
        items.forEach((item) => {
          const match = !term || item.textContent!.toLowerCase().indexOf(term) > -1;
          item.hidden = !match;
          if (match) hits++;
        });
        scope.querySelectorAll<HTMLElement>('[data-help-group]').forEach((group) => {
          const visible = group.querySelectorAll('[data-help-item]:not([hidden])').length;
          group.hidden = visible === 0;
        });
        if (empty) empty.hidden = hits > 0;
      };
      input.addEventListener('input', onInput);
      cleanups.push(() => input.removeEventListener('input', onInput));
    }

    // ---- Article table of contents ----
    const toc = document.querySelector<HTMLElement>('[data-toc]');
    const body = document.querySelector<HTMLElement>('[data-toc-source]');
    if (toc && body) {
      const headings = body.querySelectorAll<HTMLElement>('h2');
      if (headings.length >= 2) {
        headings.forEach((heading, index) => {
          if (!heading.id) heading.id = 'section-' + (index + 1);
          const link = document.createElement('a');
          link.href = '#' + heading.id;
          link.textContent = heading.textContent;
          toc.appendChild(link);
        });
        if ('IntersectionObserver' in window) {
          const links = toc.querySelectorAll('a');
          const spy = new IntersectionObserver(
            (entries) => {
              entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                links.forEach((link) =>
                  link.classList.toggle('is-active', link.getAttribute('href') === '#' + entry.target.id),
                );
              });
            },
            { rootMargin: '-20% 0px -70% 0px' },
          );
          headings.forEach((heading) => spy.observe(heading));
          cleanups.push(() => spy.disconnect());
        }
      } else {
        const wrap = toc.closest('[data-toc-wrap]') as HTMLElement | null;
        if (wrap) wrap.hidden = true;
      }
    }

    return () => cleanups.forEach((fn) => fn());
  }, [pathname]);

  return null;
}
