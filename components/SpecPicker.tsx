'use client';

import { PHOTO_SPECS, type PhotoSpecId } from '@/lib/photo-spec';

interface Props {
  value: PhotoSpecId;
  onChange: (v: PhotoSpecId) => void;
  onContinue: () => void;
}

export function SpecPicker({ value, onChange, onContinue }: Props) {
  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Choose your photo size</h2>
        <p className="text-sm text-ink-700">
          Pick the spec that matches where you&apos;ll submit the photo.
        </p>

        <div className="space-y-2">
          {Object.values(PHOTO_SPECS).map((spec) => {
            const selected = value === spec.id;
            return (
              <button
                key={spec.id}
                type="button"
                onClick={() => onChange(spec.id)}
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
                  <span className="block font-semibold">{spec.label}</span>
                  <span className="mt-0.5 block text-sm text-ink-700">{spec.description}</span>
                </span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-ink-700">
          Both sizes use a white background, 300 DPI, and face occupying ~75% of the frame.
        </p>
      </div>

      <button type="button" onClick={onContinue} className="btn-primary w-full">
        Continue
      </button>
    </div>
  );
}
