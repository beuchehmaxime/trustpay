'use client';

import { useCallback, useEffect, useState } from 'react';

/** The (not-yet-standardised) beforeinstallprompt event shape we rely on. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  prompt: () => Promise<void>;
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const DISMISS_KEY = 'bizik.pwa.install-dismissed';
const DISMISS_DAYS = 7;

/** Currently running as an installed PWA (standalone window)? */
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // iOS Safari exposes this legacy flag when launched from the home screen.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/** iOS Safari never fires beforeinstallprompt - detect it to show manual steps. */
function isIosSafari(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const iOS = /iphone|ipad|ipod/i.test(ua) ||
    // iPadOS 13+ masquerades as a Mac; disambiguate by touch support.
    (/Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1);
  const webkit = /WebKit/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua);
  return iOS && webkit;
}

function recentlyDismissed(): boolean {
  if (typeof window === 'undefined') return false;
  const raw = window.localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  const when = Number(raw);
  if (!Number.isFinite(when)) return false;
  return Date.now() - when < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export interface InstallPromptState {
  /** A native install prompt is available (Android / desktop Chromium). */
  canInstall: boolean;
  /** Running as an installed app already. */
  isInstalled: boolean;
  /** iOS Safari - installation is manual (Share → Add to Home Screen). */
  isIos: boolean;
  /** The user dismissed the banner recently (hidden until it lapses). */
  dismissed: boolean;
  /** Trigger the native install dialog; resolves to whether it was accepted. */
  promptInstall: () => Promise<boolean>;
  /** Hide the banner for a while. */
  dismiss: () => void;
}

/**
 * Drives the "install this app" experience. Captures the browser's deferred
 * `beforeinstallprompt`, tracks whether we're already installed, and surfaces
 * an iOS-specific path (which has no programmatic prompt).
 */
export function useInstallPrompt(): InstallPromptState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setIsInstalled(isStandalone());
    setIsIos(isIosSafari());
    setDismissed(recentlyDismissed());

    const onBeforeInstall = (event: Event) => {
      event.preventDefault(); // stash it so we can trigger the prompt on our terms
      setDeferred(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferred(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    setDeferred(null);
    return choice.outcome === 'accepted';
  }, [deferred]);

  const dismiss = useCallback(() => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }, []);

  return {
    canInstall: !!deferred && !isInstalled,
    isInstalled,
    isIos: isIos && !isInstalled,
    dismissed,
    promptInstall,
    dismiss,
  };
}
