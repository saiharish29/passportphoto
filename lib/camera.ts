'use client';

/**
 * Camera capture utilities for passport photos.
 *
 * Detection covers:
 *   1. Secure context + getUserMedia availability
 *   2. Browser identity AND major version (iOS 14 ≠ iOS 18)
 *   3. In-app browsers (FB / Instagram / WeChat / LinkedIn) — these have
 *      broken camera APIs and we should redirect users out
 *   4. ImageCapture API support, including practical not-just-existential check
 *   5. Device memory + concurrency (for routing low-end Androids to cloud)
 *   6. Pre-flight enumerateDevices() to confirm a usable camera exists
 */

export type CaptureCapability =
  | 'imagecapture' // Full sensor resolution via ImageCapture.takePhoto()
  | 'canvas' // Video-frame canvas grab
  | 'file-capture' // <input type="file" capture> only
  | 'unsupported'; // Nothing works

export interface BrowserInfo {
  isIOS: boolean;
  isAndroid: boolean;
  isMacOS: boolean;
  isWindows: boolean;
  isSafari: boolean;
  isChrome: boolean;
  isFirefox: boolean;
  isEdge: boolean;
  isSamsungInternet: boolean;
  /** Major version of the BROWSER (Safari 16, Chrome 120, etc.) — null if unknown. */
  browserMajor: number | null;
  /** Major version of the OS (iOS 17, Android 13) — null if unknown. */
  osMajor: number | null;
  /** Likely an in-app browser (Facebook/Instagram/WeChat/LinkedIn/etc.). */
  isInAppBrowser: boolean;
  /** Which app, if detected. */
  inAppName: string | null;
  isMobile: boolean;
  /** iPad on iPadOS 13+ that reports as Mac. */
  isIPadDesktopUA: boolean;
}

export interface DeviceInfo {
  /** Device RAM in GB, if reported. Browsers cap this at 8 for fingerprinting. */
  deviceMemoryGB: number | null;
  /** Logical CPU cores. */
  hardwareConcurrency: number | null;
  /** Heuristic — true if we should avoid heavy on-device ML. */
  isLowEnd: boolean;
}

export interface CameraSupport {
  capability: CaptureCapability;
  isSecureContext: boolean;
  hasUserCamera: boolean | null; // null = not yet probed
  hasEnvironmentCamera: boolean | null;
  browser: BrowserInfo;
  device: DeviceInfo;
  /** A list of human-readable warnings to display to the user. */
  warnings: string[];
  /** A blocker reason — if set, camera path won't work and we should force file upload. */
  blocker: string | null;
}

// ---------- Browser detection ----------

/** Parse a UA string into structured info. Pure function, testable. */
export function parseBrowserInfo(ua: string, platform?: string): BrowserInfo {
  const platformLower = (platform ?? '').toLowerCase();

  // iPad on iPadOS 13+ identifies as Macintosh in UA — detect via touch
  const looksLikeMacUA = /Macintosh|Mac OS X/i.test(ua);
  const isIPadDesktopUA =
    looksLikeMacUA &&
    typeof navigator !== 'undefined' &&
    typeof navigator.maxTouchPoints === 'number' &&
    navigator.maxTouchPoints > 1;

  const isIOS = /iPhone|iPad|iPod/i.test(ua) || isIPadDesktopUA;
  const isAndroid = /Android/i.test(ua);
  const isMacOS = looksLikeMacUA && !isIPadDesktopUA;
  const isWindows = /Windows/i.test(ua) || platformLower.includes('win');
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);

  // In-app browser fingerprints (these all break camera APIs in subtle ways)
  let inAppName: string | null = null;
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) inAppName = 'Facebook';
  else if (/Instagram/i.test(ua)) inAppName = 'Instagram';
  else if (/MicroMessenger/i.test(ua)) inAppName = 'WeChat';
  else if (/LinkedInApp/i.test(ua)) inAppName = 'LinkedIn';
  else if (/Twitter/i.test(ua) && !/TwitterBot/i.test(ua)) inAppName = 'Twitter / X';
  else if (/Line\//i.test(ua)) inAppName = 'LINE';
  // Tiktok: BytedanceWebview
  else if (/BytedanceWebview|musical_ly/i.test(ua)) inAppName = 'TikTok';
  const isInAppBrowser = inAppName !== null;

  // Browser identity — order matters (Edge/Samsung claim Chrome too)
  const isEdge = /Edg\//i.test(ua) || /Edge\//i.test(ua);
  const isSamsungInternet = /SamsungBrowser/i.test(ua);
  const isFirefox = /Firefox\//i.test(ua) && !/Seamonkey/i.test(ua);
  const isChrome =
    !isEdge &&
    !isSamsungInternet &&
    !isFirefox &&
    /Chrome|CriOS/i.test(ua);
  const isSafari =
    !isChrome &&
    !isEdge &&
    !isSamsungInternet &&
    !isFirefox &&
    /Safari|AppleWebKit/i.test(ua) &&
    !/Chrome|CriOS|FxiOS|EdgiOS/i.test(ua);

  // Browser major version
  let browserMajor: number | null = null;
  const matchVersion = (re: RegExp): number | null => {
    const m = ua.match(re);
    return m && m[1] ? parseInt(m[1], 10) : null;
  };
  if (isEdge) browserMajor = matchVersion(/Edg(?:e)?\/(\d+)/i);
  else if (isSamsungInternet) browserMajor = matchVersion(/SamsungBrowser\/(\d+)/i);
  else if (isFirefox) browserMajor = matchVersion(/Firefox\/(\d+)/i);
  else if (isChrome) browserMajor = matchVersion(/(?:Chrome|CriOS)\/(\d+)/i);
  else if (isSafari) {
    // Safari version is in "Version/16.5 Safari/...". On iOS, the iOS major is more useful,
    // but we still extract Safari version for desktop.
    browserMajor = matchVersion(/Version\/(\d+)/i);
  }

  // OS major
  let osMajor: number | null = null;
  if (isIOS) {
    // "OS 17_2 like Mac OS X" → 17
    const m = ua.match(/OS (\d+)[_\.]/i);
    osMajor = m ? parseInt(m[1], 10) : null;
  } else if (isAndroid) {
    const m = ua.match(/Android (\d+)/i);
    osMajor = m ? parseInt(m[1], 10) : null;
  }

  return {
    isIOS,
    isAndroid,
    isMacOS,
    isWindows,
    isSafari,
    isChrome,
    isFirefox,
    isEdge,
    isSamsungInternet,
    browserMajor,
    osMajor,
    isInAppBrowser,
    inAppName,
    isMobile,
    isIPadDesktopUA,
  };
}

/** Detect device-class info. */
function detectDevice(): DeviceInfo {
  if (typeof navigator === 'undefined') {
    return { deviceMemoryGB: null, hardwareConcurrency: null, isLowEnd: false };
  }
  // navigator.deviceMemory is in GB, capped at 8 by browsers, undefined on Safari
  const deviceMemoryGB =
    typeof (navigator as unknown as { deviceMemory?: number }).deviceMemory === 'number'
      ? (navigator as unknown as { deviceMemory: number }).deviceMemory
      : null;
  const hardwareConcurrency =
    typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : null;

  // Heuristic: <=2 GB OR <=2 cores → low-end. Safari users default to false because
  // we have no signal; their devices are typically not low-end anyway.
  const isLowEnd =
    (deviceMemoryGB !== null && deviceMemoryGB <= 2) ||
    (hardwareConcurrency !== null && hardwareConcurrency <= 2);

  return { deviceMemoryGB, hardwareConcurrency, isLowEnd };
}

// ---------- Capability decision ----------

/**
 * Decide capability and gather warnings/blockers based on browser + secure context.
 * Pure-ish helper for testability.
 */
export function decideCapability(
  browser: BrowserInfo,
  hasMediaDevices: boolean,
  hasImageCaptureCtor: boolean,
  isSecureContext: boolean,
): { capability: CaptureCapability; warnings: string[]; blocker: string | null } {
  const warnings: string[] = [];
  let blocker: string | null = null;

  // Hard blockers — no live camera, but we can fall back to <input capture>.
  if (browser.isInAppBrowser) {
    blocker = `${browser.inAppName} in-app browsers don't reliably support camera access. Open this page in ${browser.isIOS ? 'Safari' : 'Chrome'}.`;
    return { capability: 'file-capture', warnings, blocker };
  }
  if (!isSecureContext) {
    return {
      capability: 'file-capture',
      warnings: ['Live preview requires HTTPS. The system camera will open instead.'],
      blocker: null,
    };
  }
  if (!hasMediaDevices) {
    return {
      capability: 'file-capture',
      warnings: ['Your browser doesn\'t support live camera access.'],
      blocker: null,
    };
  }

  // Soft warnings (capability still works)
  if (browser.isIOS && browser.osMajor !== null && browser.osMajor < 14) {
    warnings.push('iOS 14+ recommended. Older versions have unreliable camera support.');
  }
  if (browser.isIOS && browser.osMajor !== null && browser.osMajor < 15) {
    warnings.push('iOS 15+ recommended for best photo quality.');
  }
  if (browser.isAndroid && browser.osMajor !== null && browser.osMajor < 8) {
    warnings.push('Android 8+ recommended. Older versions may not capture full resolution.');
  }
  if (browser.isFirefox) {
    warnings.push('Firefox cameras work but capture at video resolution only.');
  }

  // ImageCapture is reliable in Chromium (Chrome ≥59, Edge, Samsung Internet, Opera).
  // Safari has the constructor in some versions but takePhoto() throws — exclude.
  // Firefox: shipped behind a flag, never made GA — exclude.
  const imageCaptureReliable =
    hasImageCaptureCtor &&
    !browser.isSafari &&
    !browser.isFirefox &&
    // Chromium-based browsers are reliable from version 59+
    ((browser.isChrome && (browser.browserMajor ?? 0) >= 59) ||
      (browser.isEdge && (browser.browserMajor ?? 0) >= 79) ||
      browser.isSamsungInternet);

  return {
    capability: imageCaptureReliable ? 'imagecapture' : 'canvas',
    warnings,
    blocker: null,
  };
}

/**
 * Detect what level of camera support is available. Synchronous, safe on SSR.
 * For an async device-list verification, call probeCameraDevices() afterward.
 */
export function detectCameraSupport(): CameraSupport {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      capability: 'unsupported',
      isSecureContext: false,
      hasUserCamera: null,
      hasEnvironmentCamera: null,
      browser: parseBrowserInfo(''),
      device: { deviceMemoryGB: null, hardwareConcurrency: null, isLowEnd: false },
      warnings: [],
      blocker: null,
    };
  }

  const browser = parseBrowserInfo(navigator.userAgent, navigator.platform);
  const device = detectDevice();
  const isSecureContext = window.isSecureContext === true;
  const hasMediaDevices =
    typeof navigator.mediaDevices !== 'undefined' &&
    typeof navigator.mediaDevices.getUserMedia === 'function';
  const hasImageCaptureCtor =
    typeof (window as { ImageCapture?: unknown }).ImageCapture === 'function';

  const { capability, warnings, blocker } = decideCapability(
    browser,
    hasMediaDevices,
    hasImageCaptureCtor,
    isSecureContext,
  );

  // Append device-level warnings
  if (device.isLowEnd) {
    warnings.push(
      'Low-memory device detected. On-device background removal may fail; we recommend a cloud provider.',
    );
  }

  return {
    capability,
    isSecureContext,
    hasUserCamera: null,
    hasEnvironmentCamera: null,
    browser,
    device,
    warnings,
    blocker,
  };
}

/**
 * Async pre-flight: enumerate devices to confirm a camera actually exists.
 * Updates the support object with hasUserCamera / hasEnvironmentCamera.
 *
 * Note: device labels are empty until the user grants permission, but we can
 * still check that *some* video input device exists.
 */
export async function probeCameraDevices(support: CameraSupport): Promise<CameraSupport> {
  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.enumerateDevices !== 'function'
  ) {
    return { ...support, hasUserCamera: false, hasEnvironmentCamera: false };
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const videoInputs = devices.filter((d) => d.kind === 'videoinput');
    if (videoInputs.length === 0) {
      return {
        ...support,
        hasUserCamera: false,
        hasEnvironmentCamera: false,
        warnings: [...support.warnings, 'No camera was detected on this device.'],
        blocker: support.blocker ?? 'No camera available.',
        capability: 'file-capture',
      };
    }
    // We can't reliably distinguish front vs rear without permission, so we
    // assume both are present on mobile (one is) and only "user" on desktop.
    return {
      ...support,
      hasUserCamera: true,
      hasEnvironmentCamera: support.browser.isMobile,
    };
  } catch {
    // enumerateDevices can fail (rare). Don't block — let getUserMedia surface the real error.
    return support;
  }
}

// ---------- Constraints + capture ----------

export function buildVideoConstraints(facing: 'user' | 'environment'): MediaTrackConstraints {
  return {
    facingMode: { ideal: facing },
    width: { ideal: 1920, min: 640 },
    height: { ideal: 1920, min: 480 },
    // No aspectRatio hint — webcams are typically 16:9 or 4:3, asking for
    // a square aspect causes OverconstrainedError on some browsers/drivers.
    // We crop to spec aspect after capture anyway.
    ...({ focusMode: 'continuous' } as Record<string, unknown>),
  };
}

/**
 * Looser constraints for retry after OverconstrainedError.
 * Just asks for "any video" — the browser picks the best match.
 */
export function buildFallbackVideoConstraints(facing: 'user' | 'environment'): MediaTrackConstraints {
  return {
    facingMode: { ideal: facing },
  };
}

/**
 * Capture a still photo from a live MediaStream at the highest resolution
 * the device will give us. Tries ImageCapture first, falls back to canvas.
 *
 * Now also calls getPhotoCapabilities() and only claims success if
 * takePhoto returns a non-empty blob — older Chromium implementations on
 * older Android can return zero-byte blobs.
 *
 * @returns A JPEG/PNG Blob.
 */
export async function captureStillFromStream(
  stream: MediaStream,
  videoEl: HTMLVideoElement,
): Promise<Blob> {
  const track = stream.getVideoTracks()[0];
  if (!track) throw new Error('No video track in stream');

  // Path 1: ImageCapture API — verify capabilities first
  const ImageCaptureCtor = (window as { ImageCapture?: new (t: MediaStreamTrack) => unknown })
    .ImageCapture;
  if (typeof ImageCaptureCtor === 'function') {
    try {
      const ic = new ImageCaptureCtor(track) as {
        getPhotoCapabilities?: () => Promise<{
          imageWidth?: { max?: number; min?: number };
          imageHeight?: { max?: number; min?: number };
        }>;
        takePhoto: (settings?: Record<string, unknown>) => Promise<Blob>;
      };

      let settings: Record<string, unknown> | undefined;
      let capsValid = true;
      if (typeof ic.getPhotoCapabilities === 'function') {
        try {
          const caps = await ic.getPhotoCapabilities();
          // Some Android Chromium returns empty {} — treat as no real capability
          if (
            caps.imageWidth?.max &&
            caps.imageHeight?.max &&
            caps.imageWidth.max > 0 &&
            caps.imageHeight.max > 0
          ) {
            settings = {
              imageWidth: caps.imageWidth.max,
              imageHeight: caps.imageHeight.max,
            };
          } else {
            capsValid = false;
          }
        } catch {
          capsValid = false;
        }
      }

      if (capsValid) {
        const blob = await ic.takePhoto(settings);
        if (blob && blob.size > 0) return blob;
      }
    } catch (err) {
      console.warn('ImageCapture path failed; falling back to canvas grab.', err);
    }
  }

  // Path 2: Canvas grab from <video>
  if (!videoEl.videoWidth || !videoEl.videoHeight) {
    throw new Error('Video element not ready');
  }
  const canvas = document.createElement('canvas');
  canvas.width = videoEl.videoWidth;
  canvas.height = videoEl.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  ctx.drawImage(videoEl, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
      'image/jpeg',
      0.95,
    );
  });
}

export function stopStream(stream: MediaStream | null) {
  if (!stream) return;
  stream.getTracks().forEach((t) => {
    try {
      t.stop();
    } catch {
      // ignore
    }
  });
}
