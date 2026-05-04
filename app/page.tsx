'use client';

import { useEffect, useState } from 'react';
import { ProviderSetup } from '@/components/ProviderSetup';
import { SpecPicker } from '@/components/SpecPicker';
import { OutfitGuide } from '@/components/OutfitGuide';
import { CaptureOrUpload } from '@/components/CaptureOrUpload';
import { ProcessingScreen } from '@/components/ProcessingScreen';
import { ResultScreen } from '@/components/ResultScreen';
import { DEFAULT_SPEC, type PhotoSpecId } from '@/lib/photo-spec';
import { loadProviderConfig, type ProviderConfig } from '@/lib/providers';

type Step = 'provider' | 'spec' | 'outfit' | 'capture' | 'processing' | 'result';

export default function HomePage() {
  const [hydrated, setHydrated] = useState(false);
  const [step, setStep] = useState<Step>('provider');
  const [providerConfig, setProviderConfig] = useState<ProviderConfig | null>(null);
  const [specId, setSpecId] = useState<PhotoSpecId>(DEFAULT_SPEC);
  const [sourceFile, setSourceFile] = useState<File | Blob | null>(null);
  const [resultPng, setResultPng] = useState<Blob | null>(null);
  const [resultPdf, setResultPdf] = useState<Blob | null>(null);

  // Load any persisted provider config on first mount (client-only)
  useEffect(() => {
    const persisted = loadProviderConfig();
    if (persisted) {
      setProviderConfig(persisted);
    }
    setHydrated(true);
  }, []);

  // Avoid SSR/CSR mismatch — render the stepper only after hydration
  if (!hydrated) {
    return <div className="card animate-pulse text-center text-sm text-ink-700">Loading…</div>;
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Indian Passport Photo
        </h1>
        <p className="text-sm text-ink-700">
          Capture, validate, and download a Passport Seva–compliant photo + printable A4 sheet.
        </p>
      </header>

      <Stepper current={step} onStepClick={(s) => {
        // Allow jumping back to earlier steps if their prerequisites are met
        if (s === 'provider') setStep('provider');
        else if (s === 'spec' && providerConfig) setStep('spec');
        else if (s === 'outfit' && providerConfig) setStep('outfit');
        else if (s === 'capture' && providerConfig) setStep('capture');
      }} />

      {step === 'provider' && (
        <ProviderSetup
          initial={providerConfig}
          onContinue={(cfg) => {
            setProviderConfig(cfg);
            setStep('spec');
          }}
        />
      )}

      {step === 'spec' && providerConfig && (
        <SpecPicker
          value={specId}
          onChange={setSpecId}
          onContinue={() => setStep('outfit')}
        />
      )}

      {step === 'outfit' && providerConfig && (
        <OutfitGuide onContinue={() => setStep('capture')} onBack={() => setStep('spec')} />
      )}

      {step === 'capture' && providerConfig && (
        <CaptureOrUpload
          onCaptured={(file) => {
            setSourceFile(file);
            setStep('processing');
          }}
          onBack={() => setStep('outfit')}
        />
      )}

      {step === 'processing' && sourceFile && providerConfig && (
        <ProcessingScreen
          source={sourceFile}
          specId={specId}
          providerConfig={providerConfig}
          onDone={(png, pdf) => {
            setResultPng(png);
            setResultPdf(pdf);
            setStep('result');
          }}
          onError={() => setStep('capture')}
          onChangeProvider={() => setStep('provider')}
        />
      )}

      {step === 'result' && resultPng && resultPdf && (
        <ResultScreen
          png={resultPng}
          pdf={resultPdf}
          specId={specId}
          onRestart={() => {
            setResultPng(null);
            setResultPdf(null);
            setSourceFile(null);
            setStep('capture');
          }}
        />
      )}

      <Footer />
    </div>
  );
}

interface StepperProps {
  current: Step;
  onStepClick: (s: Step) => void;
}

function Stepper({ current, onStepClick }: StepperProps) {
  const steps: Array<{ id: Step; label: string }> = [
    { id: 'provider', label: 'Provider' },
    { id: 'spec', label: 'Size' },
    { id: 'outfit', label: 'Outfit' },
    { id: 'capture', label: 'Capture' },
    { id: 'processing', label: 'Process' },
    { id: 'result', label: 'Download' },
  ];
  const currentIdx = steps.findIndex((s) => s.id === current);
  return (
    <ol className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
      {steps.map((s, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const clickable = done;
        return (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => clickable && onStepClick(s.id)}
              disabled={!clickable && !active}
              className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 font-medium transition ${
                active
                  ? 'bg-ink-900 text-white'
                  : done
                    ? 'bg-saffron-500/10 text-saffron-600 hover:bg-saffron-500/20'
                    : 'bg-ink-900/5 text-ink-700'
              } ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-[10px]">
                {done ? '✓' : i + 1}
              </span>
              {s.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-ink-900/10 pt-6 text-center">
      <p className="text-xs text-ink-700">
        Designed and Developed by{' '}
        <span className="font-semibold text-ink-900">Harish Kumar MP</span>
      </p>
    </footer>
  );
}
