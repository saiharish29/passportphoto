/**
 * Background-removal provider catalog for BYOK (bring-your-own-key).
 *
 * Why these and not OpenAI/Gemini/Stability:
 *   The job is "remove the background from a real face photo, keeping the
 *   person identical". OpenAI Images, Gemini Imagen, and Stability all
 *   generate new pixels — they would re-synthesize the face, producing a
 *   different person. That fails passport identity verification. The
 *   providers below all do *segmentation* (mask out the background, keep
 *   the foreground pixels untouched), which is what we actually need.
 */

export type ProviderId =
  | 'on-device'
  | 'replicate'
  | 'photoroom'
  | 'removebg';

export interface ProviderDef {
  id: ProviderId;
  name: string;
  tagline: string;
  /** Whether this provider needs an API key. */
  requiresKey: boolean;
  /** URL pattern of the API key (used for the helper text under the input). */
  keyHint?: string;
  /** Where to get an API key. */
  signupUrl?: string;
  /** Cost-per-image hint shown in UI; null = free. */
  costPerImage: string | null;
  /** Recommended badge. */
  recommended?: boolean;
  /** A short human-friendly validation pattern for the key. */
  keyPattern?: RegExp;
}

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  'on-device': {
    id: 'on-device',
    name: 'On-device (free)',
    tagline: 'Runs entirely in your browser. No API key needed. No data leaves your device.',
    requiresKey: false,
    costPerImage: null,
    recommended: true,
  },
  replicate: {
    id: 'replicate',
    name: 'Replicate',
    tagline: 'BiRefNet model — highest quality, ~$0.002 per image.',
    requiresKey: true,
    keyHint: 'Starts with r8_…',
    signupUrl: 'https://replicate.com/account/api-tokens',
    costPerImage: '~$0.002',
    keyPattern: /^r8_[A-Za-z0-9]{20,}$/,
  },
  photoroom: {
    id: 'photoroom',
    name: 'Photoroom',
    tagline: 'Single endpoint, very fast. Free tier: 100 images/month.',
    requiresKey: true,
    keyHint: 'Sandbox key starts with sandbox_',
    signupUrl: 'https://www.photoroom.com/api',
    costPerImage: 'Free tier available',
    keyPattern: /^[A-Za-z0-9_-]{20,}$/,
  },
  removebg: {
    id: 'removebg',
    name: 'Remove.bg',
    tagline: 'Industry standard. Free tier: 50 images/month.',
    requiresKey: true,
    keyHint: '~24-character alphanumeric key',
    signupUrl: 'https://www.remove.bg/api',
    costPerImage: 'Free tier available',
    keyPattern: /^[A-Za-z0-9]{20,}$/,
  },
};

export const DEFAULT_PROVIDER: ProviderId = 'on-device';

/** All providers in display order. */
export const PROVIDER_LIST: ProviderDef[] = [
  PROVIDERS['on-device'],
  PROVIDERS.replicate,
  PROVIDERS.photoroom,
  PROVIDERS.removebg,
];

export interface ProviderConfig {
  providerId: ProviderId;
  /** Only present for providers with requiresKey === true. */
  apiKey?: string;
}

const STORAGE_KEY = 'passport-photo:provider-config:v1';

/** Load the persisted provider config from localStorage. SSR-safe. */
export function loadProviderConfig(): ProviderConfig | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ProviderConfig;
    if (!parsed.providerId || !(parsed.providerId in PROVIDERS)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Persist the provider config. */
export function saveProviderConfig(cfg: ProviderConfig): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  } catch {
    // Storage quota or disabled — ignore. The session config is in React state.
  }
}

/** Wipe persisted keys. */
export function clearProviderConfig(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Validate a config: provider exists, and key is well-formed if required. */
export interface ConfigValidation {
  ok: boolean;
  error?: string;
}

export function validateProviderConfig(cfg: ProviderConfig): ConfigValidation {
  const provider = PROVIDERS[cfg.providerId];
  if (!provider) {
    return { ok: false, error: 'Unknown provider.' };
  }
  if (!provider.requiresKey) {
    return { ok: true };
  }
  const key = (cfg.apiKey ?? '').trim();
  if (!key) {
    return { ok: false, error: 'API key is required for this provider.' };
  }
  if (provider.keyPattern && !provider.keyPattern.test(key)) {
    return {
      ok: false,
      error: `That doesn't look like a valid ${provider.name} API key.`,
    };
  }
  return { ok: true };
}
