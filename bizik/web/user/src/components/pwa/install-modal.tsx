'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { Download, Plus, Share, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useInstallPrompt } from '@/lib/pwa/use-install-prompt';
import { getTourOpen, getTourOpenServer, subscribeTour } from '@/lib/onboarding/tour-state';

/** Phones/tablets only - install-to-home-screen isn't offered on desktop. */
function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua);
  const smallViewport = window.matchMedia('(max-width: 820px)').matches;
  return mobileUa || smallViewport;
}

/**
 * Install prompt as a centered modal, shown only on **mobile browsers** (never
 * on desktop). Android/Chromium gets the native install button; iOS Safari gets
 * the Share → Add to Home Screen steps. Dismissal is remembered (7 days).
 */
export function InstallModal() {
  const { canInstall, isIos, isInstalled, dismissed, promptInstall, dismiss } = useInstallPrompt();
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setMounted(isMobileDevice());
    // Small delay so it doesn't slam up on first paint.
    const timer = window.setTimeout(() => setReady(true), 1200);
    return () => window.clearTimeout(timer);
  }, []);

  // Never on top of the onboarding tour. They are both full-screen modals and
  // this one renders above it, so a brand new account saw the tour with its
  // buttons covered by an install card for a product it had not been told about
  // yet. The tour goes first; this comes back the moment it closes.
  const tourOpen = useSyncExternalStore(subscribeTour, getTourOpen, getTourOpenServer);

  const eligible =
    mounted && ready && !tourOpen && (canInstall || isIos) && !isInstalled && !dismissed;
  if (!eligible) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[rgba(11,31,58,0.45)] p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-surface p-5 shadow-[0_24px_48px_rgba(11,31,58,0.28)]">
        <div className="flex items-start gap-3">
          <Image src="/icon-192.png" alt="BiZik" width={48} height={48} className="size-12 rounded-2xl" />
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold text-ink">Install BiZik</p>
            <p className="text-[13px] text-muted-foreground">
              Add BiZik to your home screen for a faster, full-screen experience that works offline.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="rounded-full p-1 text-muted-foreground transition hover:bg-muted hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </div>

        {canInstall ? (
          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={dismiss} className="h-11 flex-1 rounded-xl text-sm">
              Not now
            </Button>
            <Button onClick={() => void promptInstall()} className="h-11 flex-1 gap-2 rounded-xl text-sm">
              <Download className="size-4" /> Install
            </Button>
          </div>
        ) : (
          <div className="mt-4">
            <ol className="space-y-2 text-[13px] text-muted-foreground">
              <li className="flex items-center gap-2">
                <span className="font-semibold text-ink">1.</span>
                Tap the <Share className="inline size-4" /> Share button in the toolbar.
              </li>
              <li className="flex items-center gap-2">
                <span className="font-semibold text-ink">2.</span>
                Choose <Plus className="inline size-4" /> “Add to Home Screen”.
              </li>
              <li className="flex items-center gap-2">
                <span className="font-semibold text-ink">3.</span>
                Tap “Add” - BiZik lands on your home screen.
              </li>
            </ol>
            <Button variant="secondary" onClick={dismiss} className="mt-4 h-11 w-full rounded-xl text-sm">
              Got it
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
