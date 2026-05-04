'use client';

import { useEffect, useState } from 'react';
import { PHOTO_SPECS, type PhotoSpecId } from '@/lib/photo-spec';
import { PROVIDERS, type ProviderConfig } from '@/lib/providers';

interface Props {
  png: Blob;
  pdf: Blob;
  specId: PhotoSpecId;
  providerConfig: ProviderConfig;
  onRestart: () => void;
  onChangeProvider: () => void;
}

export function ResultScreen({
  png,
  pdf,
  specId,
  providerConfig,
  onRestart,
  onChangeProvider,
}: Props) {
  const spec = PHOTO_SPECS[specId];
  const provider = PROVIDERS[providerConfig.providerId];
  const [pngUrl, setPngUrl] = useState<string | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    const a = URL.createObjectURL(png);
    const b = URL.createObjectURL(pdf);
    setPngUrl(a);
    setPdfUrl(b);
    return () => {
      URL.revokeObjectURL(a);
      URL.revokeObjectURL(b);
    };
  }, [png, pdf]);

  const baseName = `passport-${spec.id}`;
  const usedOnDevice = providerConfig.providerId === 'on-device';

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Your photo is ready</h2>
        <p className="text-sm text-ink-700">
          {spec.label}. White background, 300 DPI. Processed by {provider.name}.
        </p>
        {pngUrl && (
          <div className="flex justify-center rounded-2xl bg-ink-900/5 p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={pngUrl}
              alt="Your passport photo"
              className="max-h-80 rounded-lg shadow-md"
            />
          </div>
        )}
      </div>

      {/* Quality hint — visible only when on-device was used. */}
      {usedOnDevice && (
        <div className="card space-y-3 border-amber-200 bg-amber-50/50">
          <h3 className="text-sm font-semibold text-amber-900">
            Notice white patches on your shirt or hair edges?
          </h3>
          <p className="text-sm text-amber-900">
            On-device background removal is fast and free, but can struggle with
            dark or textured clothing. For a cleaner result, switch to a cloud
            provider (most have a free tier) and reprocess the same photo.
          </p>
          <button
            type="button"
            onClick={onChangeProvider}
            className="btn-secondary w-full border-amber-300"
          >
            Switch provider and reprocess
          </button>
        </div>
      )}

      <div className="grid gap-3">
        {pngUrl && (
          <a
            href={pngUrl}
            download={`${baseName}.png`}
            className="btn-primary w-full"
          >
            ⬇ Download photo (PNG)
          </a>
        )}
        {pdfUrl && (
          <a
            href={pdfUrl}
            download={`${baseName}-A4-sheet.pdf`}
            className="btn-secondary w-full"
          >
            ⬇ Download A4 print sheet (PDF)
          </a>
        )}
      </div>

      <div className="card space-y-2 text-sm">
        <h3 className="font-semibold">Print instructions</h3>
        <ul className="list-disc space-y-1 pl-5 text-ink-700">
          <li>Open the PDF on a computer connected to a colour printer.</li>
          <li>Set print scale to <strong>100%</strong> — disable &ldquo;Fit to page&rdquo; or &ldquo;Shrink to fit&rdquo;.</li>
          <li>Use glossy or semi-gloss photo paper for best results.</li>
          <li>Cut along the corner crop marks with a sharp blade or scissors.</li>
        </ul>
      </div>

      <button type="button" onClick={onRestart} className="btn-secondary w-full">
        Take another photo
      </button>
    </div>
  );
}
