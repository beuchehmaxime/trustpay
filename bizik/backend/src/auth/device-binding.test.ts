import { describe, expect, it } from 'vitest';

import { deviceChanged, deviceFingerprint } from './device-binding';

/**
 * Device binding has to be judged on its false positives, not its true ones.
 *
 * A control that logs real people out of their own accounts gets switched off,
 * and then protects nobody. Most of these tests are therefore about the cases
 * where it must stay QUIET: browser updates, the same browser on the same
 * phone, missing user agents, clients nobody anticipated.
 */
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';
const CHROME_ANDROID_UPDATED =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.7390.54 Mobile Safari/537.36';
const SAFARI_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const FIREFOX_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
const EXPO_APP = 'BiZik/1.0 (okhttp/4.12.0; Android 13)';

describe('device fingerprint', () => {
  it('identifies the browsers our users actually have', () => {
    expect(deviceFingerprint(CHROME_ANDROID)).toBe('chrome/android');
    expect(deviceFingerprint(SAFARI_IPHONE)).toBe('safari/ios');
    expect(deviceFingerprint(FIREFOX_WINDOWS)).toBe('firefox/windows');
    expect(deviceFingerprint(EXPO_APP)).toBe('app/android');
  });

  it('is not fooled by every Chromium browser also claiming to be Safari', () => {
    // Chrome's user agent contains "Safari", and Edge's contains both "Chrome"
    // and "Safari". Matching loosely would collapse three browsers into one and
    // make the check useless rather than wrong.
    expect(deviceFingerprint(CHROME_ANDROID)).not.toBe('safari/android');
    const edge =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0';
    expect(deviceFingerprint(edge)).toBe('edge/windows');
  });

  it('ignores version numbers, which move on their own', () => {
    expect(deviceFingerprint(CHROME_ANDROID)).toBe(deviceFingerprint(CHROME_ANDROID_UPDATED));
  });

  it('returns nothing when there is nothing to go on', () => {
    expect(deviceFingerprint(null)).toBeNull();
    expect(deviceFingerprint(undefined)).toBeNull();
    expect(deviceFingerprint('')).toBeNull();
  });
});

describe('device change detection', () => {
  it('stays quiet when a browser updates itself', () => {
    // The single most important case. Chrome ships roughly every four weeks; if
    // an update signed everyone out, this control would last one release.
    expect(deviceChanged(CHROME_ANDROID, CHROME_ANDROID_UPDATED)).toBe(false);
  });

  it('stays quiet for the same device', () => {
    expect(deviceChanged(CHROME_ANDROID, CHROME_ANDROID)).toBe(false);
    expect(deviceChanged(SAFARI_IPHONE, SAFARI_IPHONE)).toBe(false);
  });

  it('flags a refresh token presented from a different device', () => {
    // The attack: a token lifted from an Android phone and replayed from a
    // desktop browser.
    expect(deviceChanged(CHROME_ANDROID, FIREFOX_WINDOWS)).toBe(true);
    expect(deviceChanged(SAFARI_IPHONE, CHROME_ANDROID)).toBe(true);
  });

  it('flags a token moving between the app and a browser', () => {
    expect(deviceChanged(EXPO_APP, CHROME_ANDROID)).toBe(true);
  });

  it('cannot check, so does not punish, when a user agent is missing', () => {
    // An old client or a script. Absence of evidence is not evidence, and a
    // control that fires on "I do not know" is a control that fires constantly.
    expect(deviceChanged(null, CHROME_ANDROID)).toBe(false);
    expect(deviceChanged(CHROME_ANDROID, null)).toBe(false);
    expect(deviceChanged(null, null)).toBe(false);
  });

  it('does not treat two unidentifiable clients as a mismatch', () => {
    expect(deviceChanged('some-internal-tool/1.0', 'another-tool/2.0')).toBe(false);
  });

  it('still flags a known device becoming a different known device', () => {
    // The boundary of the rule above: unknown-to-unknown is ignored, but
    // known-to-known is exactly what it exists to catch.
    expect(deviceChanged('curl/8.0 (Windows)', FIREFOX_WINDOWS)).toBe(false);
    expect(deviceChanged(FIREFOX_WINDOWS, CHROME_ANDROID)).toBe(true);
  });
});
