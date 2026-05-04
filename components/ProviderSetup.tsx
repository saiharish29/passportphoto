'use client';

import { useEffect, useState } from 'react';
import {
  PROVIDER_LIST,
  PROVIDERS,
  validateProviderConfig,
  saveProviderConfig,
  clearProviderConfig,
  type ProviderConfig,
  type ProviderId,
} from '@/lib/providers';

interface Props {
  initial: ProviderConfig | null;
  onContinue: (cfg: ProviderConfig) => void;
}

export function ProviderSetup({ initial, onContinue }: Props) {
  const [selectedId, setSelectedId] = useState<ProviderId>(
    initial?.providerId ?? 'on-device',
  );
  const [keys, setKeys] = useState<Record<ProviderId, string>>({
    'on-device': '',
    replicate: initial?.providerId === 'replicate' ? (initial.apiKey ?? '') : '',
    photoroom: initial?.providerId === 'photoroom' ? (initial.apiKey ?? '') : '',
    removebg: initial?.providerId === 'removebg' ? (initial.apiKey ?? '') : '',
  });
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = PROVIDERS[selectedId];
  const currentKey = keys[selectedId];

  // Re-validate as the user edits
  useEffect(() => {
    setError(null);
  }, [selectedId, currentKey]);

  function onContinueClicked() {
    const cfg: ProviderConfig = provider.requiresKey
      ? { providerId: selectedId, apiKey: currentKey.trim() }
      : { providerId: selectedId };
    const v = validateProviderConfig(cfg);
    if (!v.ok) {
      setError(v.error ?? 'Invalid configuration.');
      return;
    }
    saveProviderConfig(cfg);
    onContinue(cfg);
  }

  function onForgetClicked() {
    clearProviderConfig();
    setKeys({ 'on-device': '', replicate: '', photoroom: '', removebg: '' });
    setSelectedId('on-device');
  }

  return (
    <div className="space-y-4">
      <div className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Choose your AI provider</h2>
          <p className="mt-1 text-sm text-ink-700">
            Pick where the background-removal step runs. Your API key (if any)
            is stored only on this device — never on our server.
          </p>
        </div>

        <div className="space-y-2">
          {PROVIDER_LIST.map((p) => {
            const selected = selectedId === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedId(p.id)}
                className={`flex w-full items-start gap-3 rounded-2xl border-2 p-4 text-left transition ${
                  selected
                    ? 'border-ink-900 bg-ink-900/5'
                    : 'border-ink-900/10 bg-white hover:border-ink-900/30'
                }`}
              >
                <span
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? 'border-ink-900 bg-ink-900' : 'border-ink-900/30'
                  }`}
                  aria-hidden
                >
                  {selected && <span className="h-2 w-2 rounded-full bg-white" />}
                </span>
                <span className="flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{p.name}</span>
                    {p.recommended && (
                      <span className="rounded-full bg-saffron-500/15 px-2 py-0.5 text-xs font-medium text-saffron-600">
                        Recommended
                      </span>
                    )}
                    {p.costPerImage && (
                      <span className="rounded-full bg-ink-900/5 px-2 py-0.5 text-xs text-ink-700">
                        {p.costPerImage}
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-sm text-ink-700">
                    {p.tagline}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {/* API key input — only shown for providers that need one */}
        {provider.requiresKey && (
          <div className="space-y-2 border-t border-ink-900/10 pt-4">
            <label
              htmlFor="api-key"
              className="block text-sm font-semibold"
            >
              {provider.name} API key
            </label>
            <div className="relative">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={currentKey}
                onChange={(e) =>
                  setKeys((k) => ({ ...k, [selectedId]: e.target.value }))
                }
                placeholder={provider.keyHint}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                autoCorrect="off"
                className="w-full rounded-xl border-2 border-ink-900/10 bg-white px-3 py-3 pr-20 font-mono text-sm focus:border-ink-900 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md px-2 py-1 text-xs font-medium text-ink-700 hover:bg-ink-900/5"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            <p className="text-xs text-ink-700">
              Don&apos;t have one?{' '}
              <a
                href={provider.signupUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-saffron-600 underline-offset-2 hover:underline"
              >
                Get an API key from {provider.name} →
              </a>
            </p>
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            ✕ {error}
          </div>
        )}

        <p className="text-xs leading-relaxed text-ink-700">
          <strong>Privacy:</strong> Your photo and key are sent only to the
          provider you select. Our server forwards the request and does not
          log, cache, or persist either.
        </p>
      </div>

      <button
        type="button"
        onClick={onContinueClicked}
        className="btn-primary w-full"
      >
        Continue
      </button>

      {(initial || PROVIDER_LIST.some((p) => keys[p.id])) && (
        <button
          type="button"
          onClick={onForgetClicked}
          className="block w-full text-center text-xs text-ink-700 underline-offset-2 hover:underline"
        >
          Forget all saved keys on this device
        </button>
      )}
    </div>
  );
}
