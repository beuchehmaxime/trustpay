/**
 * Tie a session to the device it was created on.
 *
 * Refresh-token rotation with reuse detection already handles a stolen token
 * being used TWICE - the family is burned the moment the original is replayed.
 * What it cannot see is a token stolen and used ONCE, by someone else, before
 * the real owner refreshes again. For that single use the thief is
 * indistinguishable from the owner.
 *
 * A device fingerprint closes most of that. A refresh token lifted from one
 * machine and presented from another arrives with a different user agent, and a
 * session that was a Chrome-on-Android browser yesterday does not become a
 * Firefox-on-Windows one today without something being wrong.
 *
 * Two things this deliberately does NOT do:
 *
 * **It does not bind to IP.** Mobile networks in Cameroon reassign addresses
 * constantly, and a user moving between wifi and mobile data changes IP several
 * times a day. Binding to it would sign real people out all day and teach them
 * that being signed out means nothing.
 *
 * **It does not compare raw user-agent strings.** Browsers update themselves
 * weekly and the version number moves every time. Matching exactly would log
 * everyone out on each Chrome release, which is a worse outcome than the attack
 * it prevents. Only the browser family and the platform are compared - the parts
 * that do not change unless the device does.
 */

/**
 * The stable part of a user agent: browser family and operating system.
 *
 * Returns null when there is nothing to go on, which is treated as "cannot
 * check" rather than "suspicious" - a missing user agent is an old client or a
 * script, not evidence of theft, and refusing those would break them.
 */
export function deviceFingerprint(userAgent?: string | null): string | null {
  if (!userAgent) return null;
  const agent = userAgent.toLowerCase();

  // Order matters. Every Chromium browser also says "safari", and Edge says
  // both "chrome" and "safari", so the most specific claim has to win.
  const browser =
    /edg\//.test(agent) ? 'edge'
    : /opr\/|opera/.test(agent) ? 'opera'
    : /samsungbrowser/.test(agent) ? 'samsung'
    : /firefox|fxios/.test(agent) ? 'firefox'
    : /chrome|crios/.test(agent) ? 'chrome'
    : /safari/.test(agent) ? 'safari'
    : /okhttp|expo|dart|cfnetwork/.test(agent) ? 'app'
    : 'other';

  const platform =
    /android/.test(agent) ? 'android'
    : /iphone|ipad|ipod|ios/.test(agent) ? 'ios'
    : /windows/.test(agent) ? 'windows'
    : /mac os|macintosh/.test(agent) ? 'macos'
    : /linux/.test(agent) ? 'linux'
    : 'other';

  return `${browser}/${platform}`;
}

/**
 * Has the device behind this session changed?
 *
 * Only answers true when both sides are known AND differ. An unknown on either
 * side means the check could not run, and a control that cannot run must not
 * punish the user - it must say so and let the request through, so the absence
 * of evidence is never mistaken for evidence.
 */
export function deviceChanged(
  sessionUserAgent?: string | null,
  presentedUserAgent?: string | null,
): boolean {
  const known = deviceFingerprint(sessionUserAgent);
  const presented = deviceFingerprint(presentedUserAgent);
  if (!known || !presented) return false;
  // The BROWSER is what identifies a client; the platform alone is not enough.
  // An unrecognised client on Windows is not evidence that a Windows session
  // was stolen - it is evidence that we do not recognise the client. Comparing
  // anyway would flag every unusual browser, script and health checker as a
  // hijack, and the first week of that teaches everyone to ignore the signal.
  if (known.startsWith('other/') || presented.startsWith('other/')) return false;
  return known !== presented;
}
