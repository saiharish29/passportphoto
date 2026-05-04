'use client';

import { useEffect, useRef, useState } from 'react';
import { validateFileMeta, validateUploadedFile } from '@/lib/file-validation';
import {
  buildVideoConstraints,
  buildFallbackVideoConstraints,
  captureStillFromStream,
  detectCameraSupport,
  probeCameraDevices,
  stopStream,
  type CameraSupport,
} from '@/lib/camera';

interface Props {
  onCaptured: (file: File | Blob) => void;
  onBack: () => void;
}

type Mode = 'choose' | 'camera';

export function CaptureOrUpload({ onCaptured, onBack }: Props) {
  const [mode, setMode] = useState<Mode>('choose');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validatingFile, setValidatingFile] = useState(false);
  const [support, setSupport] = useState<CameraSupport | null>(null);

  // Detect camera support on the client only — first synchronous check, then
  // async device enumeration to confirm a usable camera exists.
  useEffect(() => {
    const initial = detectCameraSupport();
    setSupport(initial);
    // Async pre-flight: only probe devices if we still have a chance of using the camera
    if (initial.capability === 'imagecapture' || initial.capability === 'canvas') {
      probeCameraDevices(initial).then(setSupport);
    }
  }, []);

  async function handleFile(file: File | Blob) {
    setUploadError(null);
    const meta = validateFileMeta(file);
    if (!meta.ok) {
      setUploadError(meta.error ?? 'Invalid file.');
      return;
    }
    setValidatingFile(true);
    const result = await validateUploadedFile(file);
    setValidatingFile(false);
    if (!result.ok) {
      setUploadError(result.error ?? 'Invalid file.');
      return;
    }
    onCaptured(file);
  }

  return (
    <div className="space-y-4">
      {mode === 'choose' && (
        <>
          <UploadCard
            onFile={handleFile}
            onUseCamera={() => setMode('camera')}
            error={uploadError}
            busy={validatingFile}
            support={support}
          />

          <button type="button" onClick={onBack} className="btn-secondary w-full">
            Back
          </button>
        </>
      )}

      {mode === 'camera' && support && (
        <CameraCapture
          support={support}
          onShot={handleFile}
          onCancel={() => setMode('choose')}
        />
      )}
    </div>
  );
}

interface UploadCardProps {
  onFile: (file: File) => void;
  onUseCamera: () => void;
  error: string | null;
  busy: boolean;
  support: CameraSupport | null;
}

function UploadCard({ onFile, onUseCamera, error, busy, support }: UploadCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [dragActive, setDragActive] = useState(false);

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) onFile(f);
    e.target.value = '';
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }
  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  }

  // Render the appropriate camera CTA based on detected support
  function renderCameraCta() {
    if (!support) {
      return (
        <button type="button" className="btn-secondary w-full" disabled>
          Detecting camera…
        </button>
      );
    }
    if (support.capability === 'unsupported') {
      return null;
    }
    if (support.capability === 'file-capture') {
      // Use HTML Media Capture — opens system camera app
      return (
        <>
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => cameraInputRef.current?.click()}
            disabled={busy}
          >
            <CameraIcon className="h-5 w-5" />
            Open camera
          </button>
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={pickFile}
          />
        </>
      );
    }
    // hasUserCamera === false means we probed and found no video input
    if (support.hasUserCamera === false) {
      return (
        <button type="button" className="btn-secondary w-full" disabled>
          <CameraIcon className="h-5 w-5" />
          No camera detected
        </button>
      );
    }
    return (
      <button
        type="button"
        className="btn-secondary w-full"
        onClick={onUseCamera}
        disabled={busy}
      >
        <CameraIcon className="h-5 w-5" />
        Use camera
        {support.capability === 'imagecapture' && (
          <span className="ml-1 rounded-full bg-saffron-500/15 px-2 py-0.5 text-xs text-saffron-600">
            Full resolution
          </span>
        )}
      </button>
    );
  }

  return (
    <div className="card space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Add your photo</h2>
        <p className="text-sm text-ink-700">
          Upload an existing photo or use your camera.
        </p>
      </div>

      {/* Hard blocker — e.g. in-app browser */}
      {support?.blocker && (
        <div role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
          ⚠ {support.blocker}
        </div>
      )}

      {/* Soft warnings — e.g. low-end device */}
      {support?.warnings && support.warnings.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-ink-900/5 px-3 py-2 text-xs text-ink-700">
          {support.warnings.map((w, i) => (
            <li key={i}>· {w}</li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        disabled={busy}
        className={`flex w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition ${
          dragActive
            ? 'border-saffron-500 bg-saffron-500/5'
            : 'border-ink-900/20 bg-ink-900/[0.02] hover:border-ink-900/40 hover:bg-ink-900/[0.04]'
        } ${busy ? 'cursor-wait opacity-60' : 'cursor-pointer'}`}
        aria-label="Upload a photo"
      >
        <UploadIcon className="mb-3 h-10 w-10 text-ink-700" />
        <div className="font-semibold">
          {busy ? 'Checking…' : (
            <>
              <span className="hidden sm:inline">Drag a photo here, or </span>
              <span className="text-saffron-600 underline-offset-2 hover:underline">
                browse files
              </span>
            </>
          )}
        </div>
        <div className="mt-1 text-xs text-ink-700">
          JPG, PNG, WebP, or HEIC · up to 15 MB
        </div>
      </button>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/*"
        className="hidden"
        onChange={pickFile}
      />

      {error && (
        <div role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-800">
          ✕ {error}
        </div>
      )}

      <div className="flex items-center gap-3 text-xs text-ink-700">
        <span className="h-px flex-1 bg-ink-900/10" />
        <span>or</span>
        <span className="h-px flex-1 bg-ink-900/10" />
      </div>

      {renderCameraCta()}
    </div>
  );
}

interface CameraProps {
  support: CameraSupport;
  onShot: (blob: Blob) => void;
  onCancel: () => void;
}

function CameraCapture({ support, onShot, onCancel }: CameraProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<
    'requesting' | 'granted' | 'denied'
  >('requesting');
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'user' | 'environment'>('user');
  const [capturing, setCapturing] = useState(false);
  const [resolution, setResolution] = useState<{ w: number; h: number } | null>(null);

  // Start / restart the stream when `facing` changes
  useEffect(() => {
    let cancelled = false;

    async function start() {
      stopStream(streamRef.current);
      streamRef.current = null;
      setReady(false);
      setError(null);
      setPermissionState('requesting');

      try {
        // Try with preferred constraints. If the browser rejects with
        // OverconstrainedError (some webcams can't honour our hints), retry
        // once with bare-minimum constraints rather than failing outright.
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: buildVideoConstraints(facing),
            audio: false,
          });
        } catch (firstErr) {
          const e = firstErr as DOMException;
          if (e.name === 'OverconstrainedError') {
            console.warn('Preferred constraints rejected, retrying with fallback:', e.message);
            stream = await navigator.mediaDevices.getUserMedia({
              video: buildFallbackVideoConstraints(facing),
              audio: false,
            });
          } else {
            throw firstErr;
          }
        }

        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        setPermissionState('granted');

        const video = videoRef.current;
        if (video) {
          video.srcObject = stream;
          // iOS Safari needs these set explicitly
          video.setAttribute('playsinline', 'true');
          video.muted = true;
          await video.play().catch(() => {
            /* user gesture required on some browsers; capture button will trigger it */
          });
          // Wait for first frame so we can read videoWidth/videoHeight
          await new Promise<void>((resolve) => {
            if (video.readyState >= 2) {
              resolve();
            } else {
              video.onloadedmetadata = () => resolve();
            }
          });
          setResolution({ w: video.videoWidth, h: video.videoHeight });
          setReady(true);
        }
      } catch (e) {
        if (cancelled) return;
        const err = e as DOMException;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setPermissionState('denied');
          setError(
            'Camera permission was denied. Allow access in your browser settings, or upload a photo instead.',
          );
        } else if (err.name === 'NotFoundError') {
          setError(
            'No camera was found on this device. Upload a photo instead.',
          );
        } else if (err.name === 'OverconstrainedError') {
          // We already retried with fallback constraints — if we got here, the camera really can't satisfy.
          setError(
            `Your camera can't be configured (${err.message || 'unknown'}). Try the Flip button or upload a photo.`,
          );
        } else if (err.name === 'NotReadableError') {
          setError(
            'Your camera is in use by another app. Close it and try again.',
          );
        } else {
          setError(`Camera error: ${err.message || err.name || 'unknown'}.`);
        }
      }
    }
    start();

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [facing]);

  async function shoot() {
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream || capturing) return;
    setCapturing(true);
    try {
      const blob = await captureStillFromStream(stream, video);
      onShot(blob);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'capture failed';
      setError(`Could not capture photo: ${msg}`);
    } finally {
      setCapturing(false);
    }
  }

  if (error) {
    return (
      <div className="card space-y-3">
        <p className="text-sm text-red-700">{error}</p>
        {permissionState === 'denied' && (
          <p className="text-xs text-ink-700">
            On iOS: Settings → Safari → Camera → Allow.<br />
            On Android: tap the lock icon in the address bar → Permissions → Camera.
          </p>
        )}
        <button type="button" className="btn-secondary w-full" onClick={onCancel}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-3xl bg-black">
        <video
          ref={videoRef}
          playsInline
          muted
          className="aspect-[3/4] w-full bg-black object-cover"
          // Mirror the live preview only — captured pixels are NOT mirrored
          style={{ transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
        />

        <FaceGuideOverlay />

        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm text-white">
            <div className="text-center">
              <Spinner light />
              <div className="mt-2">
                {permissionState === 'requesting'
                  ? 'Allow camera access…'
                  : 'Starting camera…'}
              </div>
            </div>
          </div>
        )}

        {/* Resolution badge */}
        {ready && resolution && (
          <div className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-1 text-[10px] font-medium text-white backdrop-blur">
            {resolution.w}×{resolution.h}
          </div>
        )}
      </div>

      <p className="text-center text-xs text-ink-700">
        Align your face inside the oval. Look straight at the camera.
        Keep both shoulders visible.
      </p>

      <div className="grid grid-cols-3 items-center gap-3">
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          aria-label="Take photo"
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-ink-900 ring-4 ring-ink-900/10 transition active:scale-95 disabled:opacity-50"
          onClick={shoot}
          disabled={!ready || capturing}
        >
          {capturing ? (
            <Spinner light />
          ) : (
            <span className="h-12 w-12 rounded-full bg-white" />
          )}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
          disabled={capturing}
        >
          Flip
        </button>
      </div>
    </div>
  );
}

function FaceGuideOverlay() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 100 133"
      preserveAspectRatio="none"
      aria-hidden
    >
      <defs>
        <mask id="oval-mask">
          <rect width="100" height="133" fill="white" />
          <ellipse cx="50" cy="56" rx="22" ry="30" fill="black" />
        </mask>
      </defs>
      <rect width="100" height="133" fill="rgba(0,0,0,0.35)" mask="url(#oval-mask)" />
      <ellipse
        cx="50"
        cy="56"
        rx="22"
        ry="30"
        fill="none"
        stroke="white"
        strokeWidth="0.4"
        strokeDasharray="2 1.5"
        opacity="0.9"
      />
      <line
        x1="32"
        y1="42"
        x2="68"
        y2="42"
        stroke="white"
        strokeWidth="0.3"
        strokeDasharray="1 1"
        opacity="0.6"
      />
    </svg>
  );
}

function Spinner({ light = false }: { light?: boolean }) {
  return (
    <span
      className={`inline-block h-5 w-5 animate-spin rounded-full border-2 ${
        light ? 'border-white/30 border-t-white' : 'border-ink-900/20 border-t-ink-900'
      }`}
      aria-hidden
    />
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
