import { describe, expect, it } from 'vitest';
import {
  PROVIDERS,
  PROVIDER_LIST,
  validateProviderConfig,
  DEFAULT_PROVIDER,
} from './providers';

describe('PROVIDERS catalog', () => {
  it('includes on-device, replicate, photoroom, removebg', () => {
    expect(PROVIDERS['on-device']).toBeDefined();
    expect(PROVIDERS.replicate).toBeDefined();
    expect(PROVIDERS.photoroom).toBeDefined();
    expect(PROVIDERS.removebg).toBeDefined();
  });

  it('does NOT include OpenAI/Gemini/Stability', () => {
    // These were excluded intentionally — they are generative, not segmentation.
    expect((PROVIDERS as Record<string, unknown>).openai).toBeUndefined();
    expect((PROVIDERS as Record<string, unknown>).gemini).toBeUndefined();
    expect((PROVIDERS as Record<string, unknown>).stability).toBeUndefined();
  });

  it('on-device is the default and does not require a key', () => {
    expect(DEFAULT_PROVIDER).toBe('on-device');
    expect(PROVIDERS['on-device'].requiresKey).toBe(false);
  });

  it('all paid providers require a key', () => {
    expect(PROVIDERS.replicate.requiresKey).toBe(true);
    expect(PROVIDERS.photoroom.requiresKey).toBe(true);
    expect(PROVIDERS.removebg.requiresKey).toBe(true);
  });

  it('PROVIDER_LIST shows on-device first', () => {
    expect(PROVIDER_LIST[0].id).toBe('on-device');
  });

  it('every provider has a name and tagline', () => {
    for (const p of PROVIDER_LIST) {
      expect(p.name.length).toBeGreaterThan(0);
      expect(p.tagline.length).toBeGreaterThan(0);
    }
  });

  it('every paid provider has a signup URL', () => {
    for (const p of PROVIDER_LIST) {
      if (p.requiresKey) {
        expect(p.signupUrl).toMatch(/^https?:\/\//);
      }
    }
  });
});

describe('validateProviderConfig', () => {
  it('on-device is always valid (no key required)', () => {
    expect(validateProviderConfig({ providerId: 'on-device' }).ok).toBe(true);
  });

  it('rejects a missing key for paid providers', () => {
    const result = validateProviderConfig({ providerId: 'replicate' });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('required');
  });

  it('rejects an empty/whitespace-only key', () => {
    expect(validateProviderConfig({ providerId: 'replicate', apiKey: '   ' }).ok).toBe(false);
    expect(validateProviderConfig({ providerId: 'replicate', apiKey: '' }).ok).toBe(false);
  });

  it('accepts a well-formed Replicate key', () => {
    const ok = validateProviderConfig({
      providerId: 'replicate',
      apiKey: 'r8_aBcDeFgHiJkLmNoPqRsTuVwX1234567890',
    });
    expect(ok.ok).toBe(true);
  });

  it('rejects a Replicate key with the wrong prefix', () => {
    const result = validateProviderConfig({
      providerId: 'replicate',
      apiKey: 'sk-aBcDeFgHiJkLmNoPqRsTuVwX1234567890',
    });
    expect(result.ok).toBe(false);
    expect(result.error).toContain('valid');
  });

  it('accepts a well-formed Photoroom sandbox key', () => {
    const ok = validateProviderConfig({
      providerId: 'photoroom',
      apiKey: 'sandbox_aBcDeFgHiJkLmNoPqRs',
    });
    expect(ok.ok).toBe(true);
  });

  it('accepts a Remove.bg key', () => {
    expect(
      validateProviderConfig({
        providerId: 'removebg',
        apiKey: 'aBcDeFgHiJkLmNoPqRsTuVwX',
      }).ok,
    ).toBe(true);
  });

  it('rejects an unknown provider id', () => {
    const result = validateProviderConfig({
      providerId: 'mystery' as never,
    });
    expect(result.ok).toBe(false);
  });

  it('trims whitespace from keys before validating', () => {
    const ok = validateProviderConfig({
      providerId: 'replicate',
      apiKey: '  r8_aBcDeFgHiJkLmNoPqRsTuVwX1234567890  ',
    });
    expect(ok.ok).toBe(true);
  });
});
