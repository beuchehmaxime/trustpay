/**
 * A tiny framework-agnostic store that tracks how many server requests are
 * currently in flight. The axios interceptors drive it (start/done) and the
 * global overlay subscribes to it, so any call to the backend puts up a
 * blocking "Processing…" screen until every in-flight request settles.
 */
let activeRequests = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export const loadingBus = {
  start() {
    activeRequests += 1;
    if (activeRequests === 1) emit();
  },
  done() {
    if (activeRequests === 0) return;
    activeRequests -= 1;
    if (activeRequests === 0) emit();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  /** True whenever at least one request is outstanding. */
  isLoading() {
    return activeRequests > 0;
  },
};
