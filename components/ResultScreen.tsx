'use client';

import { useEffect, useState } from 'react';
import { PHOTO_SPECS, type PhotoSpecId } from '@/lib/photo-spec';

interface Props {
  png: Blob;
  pdf: Blob;
  specId: PhotoSpecId;
  onRestart: () => void;
}

export function ResultScreen({ png, pdf, specId, onRestart }: Props) {
  const spec = PHOTO_SPECS[specId];
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

  return (
    <div className="space-y-4">
      <div className="card space-y-3">
        <h2 className="text-lg font-semibold">Your photo is ready</h2>
        <p className="text-sm text-ink-700">
          {spec.label}. White background, 300 DPI.
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
