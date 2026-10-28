/**
 * Whether the onboarding tour is on screen right now.
 *
 * A module-level flag rather than context, because the two things that care
 * live in different layout trees: the tour is mounted inside the signed-in
 * shell, the install prompt in the root layout. There is no common provider to
 * hang a context on without wrapping the whole app for one boolean.
 *
 * It exists because both are full-screen modals and they collided - a brand new
 * account got the tour and the "Install Bizik" card at once, with the install
 * card on top covering the tour's own buttons. The tour wins: it explains what
 * the product is, and an install prompt means nothing to somebody who does not
 * yet know what they are installing.
 */

let open = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function setTourOpen(value: boolean): void {
  if (open === value) return;
  open = value;
  emit();
}

export function subscribeTour(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getTourOpen(): boolean {
  return open;
}

/**
 * Server snapshot. False, so a server render never suppresses the install
 * prompt - the tour cannot be open before the client has read storage anyway.
 */
export function getTourOpenServer(): boolean {
  return false;
}
