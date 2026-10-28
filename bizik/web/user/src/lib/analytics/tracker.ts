/**
 * First-party visitor analytics.
 *
 * Built rather than bought. A third-party script would have been one line, but
 * it would mean every visitor to a financial product is reported to an
 * advertising network, and the processor register would gain an entry that is
 * hard to justify to anyone. These events go to our own API and nowhere else.
 *
 * What is sent: an anonymous id this browser invents for itself, the path, the
 * referrer, and how long the page was open. No IP, no fingerprint, no
 * cross-site identifier, nothing that identifies a person. That answers how
 * many came, what they looked at and where they stopped, which is the whole
 * question, without becoming something that has to be explained to a regulator.
 */

const VISITOR_KEY = 'bizik_visitor';
const ENDPOINT = '/events';

interface QueuedEvent {
  name: string;
  path?: string;
  referrer?: string;
  durationMs?: number;
}

let queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let currentPath: string | null = null;
let enteredAt = 0;

/**
 * This browser's anonymous id.
 *
 * Generated once and kept in localStorage. Not a user id, and never derived
 * from one - the point is to count people who have NOT signed up, and an id
 * derived from an account could not do that.
 */
function visitorId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    let existing = window.localStorage.getItem(VISITOR_KEY);
    if (!existing) {
      existing =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
      window.localStorage.setItem(VISITOR_KEY, existing);
    }
    return existing;
  } catch {
    // Private browsing, or storage blocked. No id means no tracking, which is
    // the correct outcome: measurement must never be a reason a page breaks.
    return null;
  }
}

/** Does this visitor want to be counted? */
function allowed(): boolean {
  if (typeof window === 'undefined') return false;
  // Honour Do Not Track. It costs a few data points and is the difference
  // between measuring people and ignoring what they asked for.
  const dnt =
    (window as Window & { doNotTrack?: string }).doNotTrack ??
    (navigator as Navigator & { doNotTrack?: string }).doNotTrack;
  return dnt !== '1' && dnt !== 'yes';
}

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? '';
}

/**
 * Send what is queued.
 *
 * `sendBeacon` where available, because it survives the page being closed -
 * which is exactly when the most interesting event (how long they stayed, and
 * that they left here) is produced. `keepalive` fetch is the fallback for the
 * same reason.
 */
function flush(): void {
  if (!queue.length) return;
  const id = visitorId();
  if (!id) {
    queue = [];
    return;
  }

  const body = JSON.stringify({ visitorId: id, events: queue.slice(0, 50) });
  queue = [];

  const url = `${apiBase()}${ENDPOINT}`;
  try {
    if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
      navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
    }).catch(() => undefined);
  } catch {
    // Analytics is the least important thing on the page and behaves like it.
  }
}

function enqueue(event: QueuedEvent): void {
  if (!allowed()) return;
  queue.push(event);
  // Batched rather than one request per event: a visitor clicking through five
  // pages should cost one request, not five.
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 2000);
}

/** Record a page view, and how long the previous page was open. */
export function trackPageView(path: string): void {
  if (!allowed()) return;

  if (currentPath && currentPath !== path) {
    enqueue({ name: 'page_view', path: currentPath, durationMs: Date.now() - enteredAt });
  }
  currentPath = path;
  enteredAt = Date.now();

  enqueue({
    name: 'page_enter',
    path,
    referrer: typeof document !== 'undefined' ? document.referrer || undefined : undefined,
  });
}

/** Record something the visitor did, e.g. 'signup_started', 'kyc_started'. */
export function trackEvent(name: string, path?: string): void {
  enqueue({ name, path: path ?? currentPath ?? undefined });
}

/**
 * Close the current page view and send immediately.
 *
 * Bound to `visibilitychange` rather than `unload`: mobile browsers routinely
 * kill a backgrounded tab without ever firing unload, so anything that waits
 * for it loses every mobile session - which, here, is most of them.
 */
export function flushOnHide(): void {
  if (typeof document === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') return;
    if (currentPath) {
      queue.push({ name: 'page_view', path: currentPath, durationMs: Date.now() - enteredAt });
      enteredAt = Date.now();
    }
    flush();
  });
}
