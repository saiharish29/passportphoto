import { describe, expect, it } from 'vitest';
import { parseBrowserInfo, decideCapability } from './camera';

// Real-world UA strings from current devices (sampled May 2026)
const UAs = {
  iPhoneSafari17:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  iPhoneSafari14:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
  iPhoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1',
  iPadDesktop:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  androidChrome120:
    'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  androidChromeOld:
    'Mozilla/5.0 (Linux; Android 7.0; SM-G930F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/95.0.4638.74 Mobile Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 13; SAMSUNG SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/22.0 Chrome/115.0.0.0 Mobile Safari/537.36',
  desktopChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  desktopEdge:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
  desktopFirefox:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  desktopSafari:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  facebookIOS:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/450.0.0.0]',
  instagramAndroid:
    'Mozilla/5.0 (Linux; Android 13; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36 Instagram 300.0.0.0',
  wechat:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.42(0x18002a30)',
};

describe('parseBrowserInfo', () => {
  it('detects iPhone Safari 17 with iOS 17', () => {
    const b = parseBrowserInfo(UAs.iPhoneSafari17);
    expect(b.isIOS).toBe(true);
    expect(b.isSafari).toBe(true);
    expect(b.isChrome).toBe(false);
    expect(b.osMajor).toBe(17);
    expect(b.browserMajor).toBe(17);
    expect(b.isMobile).toBe(true);
    expect(b.isInAppBrowser).toBe(false);
  });

  it('detects iPhone Safari 14 with iOS 14', () => {
    const b = parseBrowserInfo(UAs.iPhoneSafari14);
    expect(b.osMajor).toBe(14);
  });

  it('detects iPhone Chrome (CriOS) — still iOS', () => {
    const b = parseBrowserInfo(UAs.iPhoneChrome);
    expect(b.isIOS).toBe(true);
    expect(b.isChrome).toBe(true);
    expect(b.isSafari).toBe(false);
    expect(b.browserMajor).toBe(120);
  });

  it('detects Android Chrome 120 with Android 13', () => {
    const b = parseBrowserInfo(UAs.androidChrome120);
    expect(b.isAndroid).toBe(true);
    expect(b.isChrome).toBe(true);
    expect(b.osMajor).toBe(13);
    expect(b.browserMajor).toBe(120);
    expect(b.isMobile).toBe(true);
  });

  it('detects old Android (Android 7)', () => {
    const b = parseBrowserInfo(UAs.androidChromeOld);
    expect(b.osMajor).toBe(7);
  });

  it('detects Samsung Internet correctly (not Chrome)', () => {
    const b = parseBrowserInfo(UAs.androidSamsung);
    expect(b.isSamsungInternet).toBe(true);
    expect(b.isChrome).toBe(false);
    expect(b.browserMajor).toBe(22);
  });

  it('detects desktop Chrome 120', () => {
    const b = parseBrowserInfo(UAs.desktopChrome);
    expect(b.isChrome).toBe(true);
    expect(b.isWindows).toBe(true);
    expect(b.isMobile).toBe(false);
    expect(b.browserMajor).toBe(120);
  });

  it('detects Edge correctly (not Chrome)', () => {
    const b = parseBrowserInfo(UAs.desktopEdge);
    expect(b.isEdge).toBe(true);
    expect(b.isChrome).toBe(false);
    expect(b.browserMajor).toBe(120);
  });

  it('detects Firefox', () => {
    const b = parseBrowserInfo(UAs.desktopFirefox);
    expect(b.isFirefox).toBe(true);
    expect(b.isChrome).toBe(false);
    expect(b.browserMajor).toBe(122);
  });

  it('detects desktop Safari', () => {
    const b = parseBrowserInfo(UAs.desktopSafari);
    expect(b.isSafari).toBe(true);
    expect(b.isMacOS).toBe(true);
    expect(b.browserMajor).toBe(17);
  });

  it('detects Facebook in-app browser on iOS', () => {
    const b = parseBrowserInfo(UAs.facebookIOS);
    expect(b.isInAppBrowser).toBe(true);
    expect(b.inAppName).toBe('Facebook');
  });

  it('detects Instagram in-app browser', () => {
    const b = parseBrowserInfo(UAs.instagramAndroid);
    expect(b.isInAppBrowser).toBe(true);
    expect(b.inAppName).toBe('Instagram');
  });

  it('detects WeChat MicroMessenger', () => {
    const b = parseBrowserInfo(UAs.wechat);
    expect(b.isInAppBrowser).toBe(true);
    expect(b.inAppName).toBe('WeChat');
  });

  it('returns sensible defaults for empty UA', () => {
    const b = parseBrowserInfo('');
    expect(b.isIOS).toBe(false);
    expect(b.isAndroid).toBe(false);
    expect(b.osMajor).toBeNull();
    expect(b.browserMajor).toBeNull();
    expect(b.isInAppBrowser).toBe(false);
  });
});

describe('decideCapability', () => {
  function browser(overrides: Partial<ReturnType<typeof parseBrowserInfo>> = {}) {
    return { ...parseBrowserInfo(UAs.androidChrome120), ...overrides };
  }

  it('chooses imagecapture for modern Android Chrome', () => {
    const r = decideCapability(browser(), true, true, true);
    expect(r.capability).toBe('imagecapture');
    expect(r.blocker).toBeNull();
  });

  it('chooses canvas for Safari even when ImageCapture exists', () => {
    const r = decideCapability(
      browser({ isChrome: false, isSafari: true, isAndroid: false, isIOS: true, osMajor: 17 }),
      true,
      true,
      true,
    );
    expect(r.capability).toBe('canvas');
  });

  it('chooses canvas for Firefox', () => {
    const r = decideCapability(
      browser({ isChrome: false, isFirefox: true }),
      true,
      true,
      true,
    );
    expect(r.capability).toBe('canvas');
  });

  it('chooses canvas for old Chrome (<59)', () => {
    const r = decideCapability(browser({ browserMajor: 50 }), true, true, true);
    expect(r.capability).toBe('canvas');
  });

  it('chooses imagecapture for Edge ≥79', () => {
    const r = decideCapability(
      browser({ isChrome: false, isEdge: true, browserMajor: 120 }),
      true,
      true,
      true,
    );
    expect(r.capability).toBe('imagecapture');
  });

  it('falls back to file-capture without secure context', () => {
    const r = decideCapability(browser(), true, true, false);
    expect(r.capability).toBe('file-capture');
    expect(r.blocker).toBeNull(); // soft, not blocked — the user can still capture
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('falls back to file-capture when getUserMedia missing', () => {
    const r = decideCapability(browser(), false, false, true);
    expect(r.capability).toBe('file-capture');
  });

  it('blocks in-app browsers', () => {
    const r = decideCapability(
      browser({ isInAppBrowser: true, inAppName: 'Instagram' }),
      true,
      true,
      true,
    );
    expect(r.capability).toBe('file-capture');
    expect(r.blocker).toContain('Instagram');
  });

  it('warns on iOS <14', () => {
    const r = decideCapability(
      browser({ isIOS: true, osMajor: 13, isAndroid: false }),
      true,
      true,
      true,
    );
    expect(r.warnings.some((w) => w.includes('iOS 14'))).toBe(true);
  });

  it('warns on Android <8', () => {
    const r = decideCapability(
      browser({ isIOS: false, isAndroid: true, osMajor: 6 }),
      true,
      true,
      true,
    );
    expect(r.warnings.some((w) => w.includes('Android 8'))).toBe(true);
  });
});
