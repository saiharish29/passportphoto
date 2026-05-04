# Indian Passport Photo

A Next.js 14 web app that captures or uploads a photo, validates it against
Indian passport requirements (Passport Seva online + physical paper specs),
removes the background using your choice of provider (on-device WASM or a
cloud API with your own key), and produces both a digital photo (PNG) and
a printable A4 sheet (PDF) of 12+ copies with crop marks.

**Designed and Developed by Harish Kumar MP**

---

## Table of Contents

1. [What it does](#what-it-does)
2. [Architecture](#architecture)
3. [Project structure](#project-structure)
4. [Local development](#local-development)
5. [Phone testing](#phone-testing-camera-needs-https)
6. [Verification gates](#verification-gates)
7. [Deployment to Vercel](#deployment-to-vercel)
8. [Manual QA checklist](#manual-qa-checklist)
9. [Tuning the crop algorithm](#tuning-the-crop-algorithm)
10. [Design decisions](#design-decisions-and-non-goals)
11. [Known limitations](#known-limitations)

---

## What it does

The app guides the user through six steps:

1. **Provider** — Choose where background removal runs. Your API key (if any)
   is stored only on this device, never sent to our server for storage.
   Options:
   - **On-device** (free, runs in browser via WASM)
   - **Replicate** (~$0.002/image, BiRefNet model)
   - **Photoroom** (free tier: 100 images/month)
   - **Remove.bg** (free tier: 50 images/month)

2. **Size** — Pick a spec:
   - **51 × 51 mm** — Passport Seva online application upload
   - **35 × 45 mm** — physical paper application

3. **Outfit** — Pre-capture tips (dark solid colours, no patterns, neutral
   expression, soft even light, no hats). The app does NOT do AI outfit
   editing — passport photos must be a true likeness.

4. **Capture** — Camera capture (`getUserMedia` + `ImageCapture` API for
   full sensor resolution where supported, canvas grab fallback) OR
   drag-and-drop / browse upload.

5. **Process** — Pipeline runs:
   - HEIC → JPEG normalization (for iPhone photos on non-Safari browsers)
   - EXIF orientation correction (rotates pixels upright)
   - MediaPipe face detection (478 landmarks, iris-based eye centre)
   - Validation (face count, head tilt, centering, resolution, lighting)
   - Background removal (selected provider)
   - Crop to spec dimensions with chin-to-crown framing
   - Composite onto white at exact pixel dimensions

6. **Download** — Digital photo (PNG, 602×602 px @ 300 DPI for 51 mm spec)
   and A4 print sheet (PDF with crop marks and "print at 100%" instruction).

---

## Architecture

```
                    ┌───────────────────────────────────┐
                    │      Browser (mobile-first)       │
                    │                                   │
  ┌─── camera ──────│  Step 1: ProviderSetup            │
  │                 │  Step 2: SpecPicker               │
  │  ┌── upload ───►│  Step 3: OutfitGuide              │
  │  │              │  Step 4: CaptureOrUpload          │
  │  │              │            │                      │
  │  │              │            ├─► lib/camera.ts      │
  │  │              │            │   (UA detection,     │
  │  │              │            │    ImageCapture API, │
  │  │              │            │    fallback chain)   │
  │  │              │            │                      │
  │  │              │  Step 5: ProcessingScreen         │
  │  │              │            │                      │
  │  │              │            ├─► lib/heic.ts        │
  │  │              │            │   (magic-byte sniff, │
  │  │              │            │    heic2any via CDN) │
  │  │              │            │                      │
  │  │              │            ├─► lib/image-         │
  │  │              │            │   orientation.ts     │
  │  │              │            │   (EXIF parser +     │
  │  │              │            │    canvas rotate)    │
  │  │              │            │                      │
  │  │              │            ├─► lib/face-detect.ts │
  │  │              │            │   (MediaPipe via     │
  │  │              │            │    esm.sh CDN)       │
  │  │              │            │                      │
  │  │              │            ├─► lib/validation.ts  │
  │  │              │            │                      │
  │  │              │            ├─► lib/background.ts  │
  │  │              │            │   ├── @imgly via     │
  │  │              │            │   │   esm.sh CDN     │
  │  │              │            │   └── /api/          │
  │  │              │            │       remove-bg     ─┼──► Replicate
  │  │              │            │                      │     Photoroom
  │  │              │            │                      │     Remove.bg
  │  │              │            ├─► lib/crop-math.ts   │
  │  │              │            ├─► Canvas composite   │
  │  │              │            └─► lib/pdf-sheet.ts   │
  │  │              │                (pdf-lib)          │
  │  │              │  Step 6: ResultScreen             │
  │  │              │           (download buttons)      │
  │  │              └───────────────────────────────────┘
  │  │
  user phone gallery
  user phone camera
```

**Key architectural decisions:**

- **Heavy ML libs are loaded from `esm.sh` at runtime** (MediaPipe ~3 MB,
  imgly ~40 MB on first run). This keeps the Next.js bundle small (~270 KB
  First Load JS) and avoids webpack/SWC issues with onnxruntime-web's
  bundled distribution.
- **Server is a thin proxy** for cloud providers, not a stateful service.
  API keys flow through the request body, are used immediately, and
  discarded — never logged, never persisted.
- **Pure-function core logic** (UA parsing, EXIF parsing, crop math, PDF
  generation, validation) is testable in Node and rigorously unit-tested.
  Browser-dependent code (camera, canvas compositing, model loading) is
  isolated to client-only modules tested manually on real devices.

---

## Project structure

```
passport-photo/
├── app/
│   ├── api/remove-bg/route.ts     Server proxy for cloud BG-removal providers
│   ├── globals.css                Tailwind + custom button classes
│   ├── layout.tsx                 Root layout, viewport meta
│   └── page.tsx                   Step orchestrator + footer
├── components/
│   ├── ProviderSetup.tsx          Step 1: BYOK provider picker
│   ├── SpecPicker.tsx             Step 2: 51×51 vs 35×45 spec
│   ├── OutfitGuide.tsx            Step 3: pre-capture tips
│   ├── CaptureOrUpload.tsx        Step 4: camera + dropzone
│   ├── ProcessingScreen.tsx       Step 5: pipeline runner with progress
│   └── ResultScreen.tsx           Step 6: preview + downloads
├── lib/
│   ├── photo-spec.ts              Dimensions, mm/px/pt conversions
│   ├── photo-spec.test.ts            (9 tests)
│   ├── crop-math.ts               Face landmarks → spec-compliant crop
│   ├── crop-math.test.ts             (13 tests)
│   ├── validation.ts              11 validation rules with severity
│   ├── validation.test.ts            (11 tests)
│   ├── pdf-sheet.ts               A4 grid generator with crop marks
│   ├── pdf-sheet.test.ts             (6 tests)
│   ├── face-detect.ts             MediaPipe FaceLandmarker wrapper
│   ├── background.ts              Background removal dispatcher
│   ├── camera.ts                  UA detection + ImageCapture API + fallback
│   ├── camera.test.ts                (24 tests)
│   ├── heic.ts                    HEIC magic-byte detection + conversion
│   ├── heic.test.ts                  (14 tests)
│   ├── image-orientation.ts       EXIF parser + canvas rotate
│   ├── image-orientation.test.ts     (10 tests)
│   ├── file-validation.ts         Pre-pipeline file checks
│   ├── file-validation.test.ts       (10 tests)
│   ├── providers.ts               Provider catalog + key validation
│   └── providers.test.ts             (16 tests)
├── scripts/
│   └── sample-sheet.ts            Generates sample PDFs for visual QA
├── sample-seva-51.pdf             Pre-built sample (51 mm spec, 12 photos)
├── sample-physical-35x45.pdf      Pre-built sample (35×45 spec, 25 photos)
├── next.config.js                 COOP/COEP headers for SharedArrayBuffer
├── tailwind.config.js             Mobile-first, saffron + ink palette
├── postcss.config.js
├── tsconfig.json
├── vitest.config.ts
├── .eslintrc.json
├── .env.example                   Optional REPLICATE_API_TOKEN
└── package.json
```

**Total:** 113 unit tests across 9 test files. All pure-function logic
covered.

---

## Local development

### Prerequisites

- **Node.js 18.17 or newer** (Node 20+ recommended)
- ~1 GB free disk space for `node_modules`
- A modern browser (Chrome 100+, Safari 15+, Firefox 110+, Edge 100+)

### Install and run

```bash
unzip passport-photo-mvp.zip
cd passport-photo
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

The first time the app processes a photo:
- MediaPipe model: ~3 MB downloaded from Google Storage CDN
- imgly background-removal model: ~40 MB downloaded from imgly CDN
- Both cached in browser; subsequent runs are fast.

### Available scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server with hot-reload |
| `npm run build` | Production build, validates entire codebase |
| `npm run start` | Run the production build locally |
| `npm run typecheck` | TypeScript check without emitting files |
| `npm test` | Run all 113 unit tests via vitest |
| `npm run lint` | Run ESLint with `next/core-web-vitals` config |

---

## Phone testing (camera needs HTTPS)

Camera APIs (`getUserMedia`) require a **secure context** — HTTPS or
`localhost`. Plain HTTP from your laptop's IP **will not work**.

### Option A: Same WiFi, plain HTTP (upload only, no live camera)

```bash
# Find your laptop's IP
# Mac:     ipconfig getifaddr en0
# Linux:   hostname -I | awk '{print $1}'
# Windows: ipconfig | findstr IPv4
```

Visit `http://<laptop-ip>:3000` from your phone. Upload + processing work,
but the camera button won't.

### Option B: HTTPS via ngrok (camera works) — recommended

```bash
# One-time: sign up at ngrok.com to get a free auth token
ngrok config add-authtoken <your-token>

# In a new terminal while `npm run dev` is running:
ngrok http 3000
```

ngrok prints an `https://abcd-1234.ngrok-free.app` URL. Open that on your
phone — iOS Safari and Android Chrome will allow camera access.

You'll see a one-time ngrok warning page; click "Visit Site". This is
ngrok's anti-abuse mechanism, not a security concern.

---

## Verification gates

Before shipping a change, all four must pass:

```bash
npm run typecheck       # TypeScript strict mode
npm test                # 113 unit tests
npm run lint            # ESLint, no warnings or errors
npm run build           # Full Next.js production build
```

The unit tests cover:

| Module | Tests | What's verified |
|---|---|---|
| `photo-spec` | 9 | mm→px conversions, mm→pt for PDF, exact spec dimensions (602×602 for 51 mm @ 300 DPI) |
| `crop-math` | 13 | Chin-to-crown extension, head ratio matches spec target, **comfortable headroom guarantee (>12% of crop height)**, padding fallback when face is too close to edge |
| `validation` | 11 | All 11 validation rules: no face, multiple faces, low resolution, head tilt, centering, lighting |
| `pdf-sheet` | 6 | A4 dimensions in pt and mm, 3×4 layout for 51 mm spec, 5×5 for 35×45 spec, grid centering |
| `camera` | 24 | UA parsing for iPhone Safari/Chrome, Android Chrome/Samsung, Edge, Firefox; in-app browser detection (Facebook, Instagram, WeChat, etc.); capability decision tree |
| `heic` | 14 | Magic-byte sniffing for `heic`/`heif`/`mif1`/`msf1`/`heix` brands; MIME case-insensitivity; rejects JPEG/PNG/MP4 |
| `image-orientation` | 10 | EXIF parser for all 8 orientations, big-endian + little-endian, malformed input handling |
| `file-validation` | 10 | Size cap (15 MB), MIME whitelist, empty file rejection |
| `providers` | 16 | Provider catalog correctness, API-key format validation, on-device default |

What's **not** automatable from a CI environment (real-device QA needed):

- Camera permission flow on iOS Safari, Android Chrome
- ImageCapture API on Chromium browsers
- imgly WASM model loading and inference on real phones
- HEIC conversion on a real iPhone photo
- EXIF rotation on a real portrait phone capture
- Print fidelity (the 100% scale instruction is critical)

---

## Deployment to Vercel

```bash
npm install -g vercel
vercel login
vercel
# Accept defaults — Vercel auto-detects Next.js
```

In Vercel dashboard → Project → Settings → Environment Variables:

| Key | Value | Required? |
|---|---|---|
| `REPLICATE_API_TOKEN` | (deprecated — kept for backwards compat) | No |
| `NEXT_PUBLIC_APP_URL` | `https://your-domain.vercel.app` | Optional |

**Note on the API key model:** the app is BYOK (bring-your-own-key). End
users supply their own provider key in step 1, stored in their browser's
localStorage. Your server's job is just to proxy the request to the chosen
provider with the user-supplied key.

**Vercel-specific notes:**

- The `/api/remove-bg` route uses `runtime = 'nodejs'` and `maxDuration = 60`.
  60 s requires the Pro plan; on Hobby it caps at 10 s. If you stay on
  Hobby, expect Replicate cold-starts to occasionally exceed the limit.
- No model weights are bundled. MediaPipe and imgly are loaded from
  esm.sh at runtime, so the Vercel function bundle stays small.
- All static pages prerender. Only `/api/remove-bg` is server-rendered.
- COOP/COEP headers are configured in `next.config.js` to enable
  `SharedArrayBuffer` for the on-device WASM. This unlocks multi-threaded
  inference. If your environment doesn't support it, imgly automatically
  falls back to single-threaded mode (slower but still works).

---

## Manual QA checklist

These tests cannot be automated. Run them on real devices before declaring
the app production-ready.

### Devices

- iPhone Safari (iOS 16+)
- Android Chrome (recent)
- Desktop Chrome and Safari

### Pre-capture flow

| # | Test | Expected |
|---|---|---|
| 1 | Open app for the first time | Provider step appears as step 1 |
| 2 | Choose On-device, click Continue | Lands on Size step |
| 3 | Choose Replicate, paste invalid key (e.g. "abc"), Continue | Inline red error: "doesn't look like a valid Replicate API key" |
| 4 | Choose Replicate, paste valid `r8_...` key | Continue works, key persists across page reload |
| 5 | Click "Forget all saved keys on this device" | localStorage cleared, returns to On-device default |

### Capture / Upload

| # | Test | Expected |
|---|---|---|
| 6 | Open in Instagram in-app browser | Amber blocker: "Instagram in-app browsers don't reliably support camera access. Open this page in Safari/Chrome." |
| 7 | Open on iOS 13 or older | Grey notice: "iOS 14+ recommended" |
| 8 | On Windows desktop with no webcam | Camera button shows "No camera detected" |
| 9 | On Android Chrome — tap Use camera | Permission prompt → live preview, oval guide visible, "Full resolution" badge appears |
| 10 | On iOS Safari — tap Use camera | Permission prompt → live preview (Safari uses canvas grab path, no badge) |
| 11 | Tap Flip | Switches front ⇄ rear camera without restarting the page |
| 12 | Drag a JPG from Finder onto the dropzone (desktop) | Border turns saffron, file is accepted |
| 13 | Drag a 20 MB photo onto the dropzone | Inline error: "File is too large (20 MB). Maximum is 15 MB." |
| 14 | Drag a PDF | Inline error: "Unsupported file type" |
| 15 | Drag a 200×200 px image | Inline error: "Image is too small. Minimum 400×400 px." |
| 16 | Upload an iPhone HEIC file from Android Chrome | Processing succeeds (heic2any conversion happens silently in normalization step) |
| 17 | Upload a portrait phone photo with EXIF orientation 6 | Face is detected (was processed sideways before EXIF normalization) |

### Processing

| # | Test | Expected |
|---|---|---|
| 18 | Capture/upload a clean, centred face in good light | Reaches result screen in <30 s on first run, <10 s on subsequent runs |
| 19 | Capture with face deliberately off-centre (eyes outside central 70%) | Validation error: "Centre your face in the frame" |
| 20 | Capture in dim light (max brightness <80) | Validation error: "Image is too dark" |
| 21 | Upload a group photo with 2+ faces | Validation error: "N faces detected. Only one person should be in the frame." |
| 22 | Tilt head sideways ~15° | Validation error: "Your head is tilted" |
| 23 | Tilt head only ~5° | Yellow warning, but processing proceeds |
| 24 | Capture with face <200 px tall (very far from camera) | Validation error: "Image resolution is too low" |
| 25 | On low-RAM phone (e.g. 2GB Android), with On-device provider | imgly may fail with OOM. Error message includes one-click "Change provider" button. |
| 26 | Click "Change provider" from error screen | Returns to step 1 with provider config preserved |

### Output verification (the most important step)

| # | Test | Expected |
|---|---|---|
| 27 | Result screen shows preview | Face on white background, **comfortable margin above hair** (>12% of frame height) |
| 28 | Tap "Download photo (PNG)" | File `passport-seva-51.png`. Open it: dimensions are exactly **602×602 px** (or 413×531 for 35×45). |
| 29 | Tap "Download A4 print sheet (PDF)" | File saves. Open: **A4 (210×297 mm)**, 12 photos in 3×4 grid (or 25 in 5×5 for 35×45), crop marks at every corner, footer text visible. |
| 30 | Print PDF at **100% scale** on A4 paper | Cut a single photo. **Measure with a ruler — must be 51×51 mm (or 35×45 mm) ±0.5 mm.** |
| 31 | Submit a printed photo with a real Passport Seva online application | Photo accepted at upload (no "photo does not meet requirements" error) |
| 32 | Lighthouse mobile audit on deployed URL | Performance ≥85, Accessibility ≥95 |

---

## Tuning the crop algorithm

The crop algorithm has two main dials in `lib/photo-spec.ts` and
`lib/crop-math.ts`.

### `HAIR_EXTENSION_RATIO` (in `lib/crop-math.ts`)

Controls how much above MediaPipe's tight face bounding box we estimate
the crown of the head sits. MediaPipe's face box doesn't include hair.

- **Default: `0.48`** (48% of face height)
- Range: 0.30 – 0.55
- Higher → more headroom, but if too high (>0.55) the head ends up below
  the 70% spec minimum
- Indian adult haircuts: empirical 35-50%

### `faceHeightTarget` (in `lib/photo-spec.ts`)

Where the head's full chin-to-crown height lands as a fraction of the
photo's height.

- **Default: `0.70`** (lower end of ICAO 70-80% spec)
- Range: 0.70 – 0.80
- Lower → smaller face in frame, more white space everywhere
- Higher → tighter framing, less margin

### How they combine

| HAIR_EXTENSION | faceHeightTarget | Headroom (% of frame) | mm of margin (51 mm photo) |
|---|---|---|---|
| 0.30 | 0.75 | ~14% | ~7 mm |
| 0.40 | 0.72 | ~21% | ~10.7 mm |
| **0.48** | **0.70** | **~26%** | **~13.3 mm** |
| 0.55 | 0.70 | ~30% | ~15.3 mm |

The **comfortable headroom guarantee test** in `crop-math.test.ts` requires
the headroom to exceed 12% of crop height. This guards against accidental
regression — push the constants too tight and the test fails loudly.

---

## Design decisions and non-goals

### Why no OpenAI / Gemini / Stability provider option?

The original brief mentioned these. The job here is "remove the background
from a real face photo, keeping the person identical." OpenAI Images,
Gemini Imagen, and Stability all generate **new** pixels — they would
re-synthesize the face, producing a different person. That fails passport
identity verification. The supported providers (Replicate BiRefNet,
Photoroom, Remove.bg, on-device imgly) all do **segmentation** — mask out
the background, keep foreground pixels untouched.

### Why no AI outfit editing?

The original brief asked for "outfit enhancement via inpainting". Indian
passport guidelines (and ICAO Doc 9303) require the photo to be a true
likeness. Generative inpainting of clothing changes the photo and is
potentially document fraud. We surface outfit suggestions BEFORE capture
instead — show users what to wear, then capture truthfully.

### Why no gender detection?

The original brief mentioned "gender (optional, probabilistic)" detection.
Adds nothing the user can't supply with one tap, and is ethically and
legally fraught (DPDP Act treats it as sensitive personal data).

### Why ESM-from-CDN instead of npm-bundled?

`@imgly/background-removal` and `@mediapipe/tasks-vision` both depend on
`onnxruntime-web`, which Next.js's SWC compiler fails to parse correctly
during build. Loading them from `esm.sh` at runtime sidesteps the issue
entirely, keeps the Vercel function bundle small, and works reliably
across deployment platforms. Trade-off: first-time users do an extra
network hop on the CDN.

### Why force the user to pick a provider in step 1?

To make the data flow explicit. With BYOK, where the photo goes matters:
on-device means it never leaves the browser; cloud means it transits the
provider's servers (under the user's own contract with that provider).
Hiding this choice would be a privacy leak.

---

## Known limitations

- **iOS Safari `getUserMedia`** requires HTTPS in production. Vercel
  provides this automatically. On `localhost` it works over HTTP.
- **iOS Safari ImageCapture** is unreliable, so we use canvas grab on
  Safari (limited to video resolution, typically 720p–1080p).
- **Memory on low-end Android**: the imgly WASM model uses ~150 MB RAM.
  On phones with <3 GB RAM, the local path may OOM. The cloud-provider
  option is the safety net — and the error screen has a one-click button
  to switch.
- **Ad blockers** that block `esm.sh` will fail to load MediaPipe and
  imgly. The user gets a generic error. Rare but possible. If you see
  this in production, the fix is to host the assets yourself (see
  `serverComponentsExternalPackages` in next.config — currently absent
  but easy to add).
- **HEIC conversion** uses `heic2any` (also CDN-loaded). Conversion takes
  3–8 seconds for a typical 4 MB iPhone photo and uses ~200 MB RAM
  briefly. May fail on very low-end phones.
- **Multi-image HEIC sequences** (`msf1` brand) are converted to a single
  JPEG using only the first frame.

---

## License & disclaimers

The app does not store or transmit captured photos to any server **unless**
the user has chosen a cloud provider. In that case, the photo briefly
transits the chosen provider's API for processing — that provider's data
retention policy applies, not ours.

The app does not guarantee acceptance by Passport Seva or any government
authority. Users should always verify the photo meets current requirements
on the official passportindia.gov.in portal before submission.

---

**Designed and Developed by [Harish Kumar MP](#)**
