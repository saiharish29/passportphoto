// One-off: generate a sample sheet for visual inspection.
// Run with: npx tsx scripts/sample-sheet.ts (or compile + run via node)
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { buildA4Sheet } from '../lib/pdf-sheet';
import { PHOTO_SPECS, mmToPx } from '../lib/photo-spec';

function makePngWithDot(width: number, height: number, label: 'A' | 'B'): Uint8Array {
  // Solid white image with a coloured square in the middle to verify
  // image positioning visually.
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdrData = new Uint8Array(13);
  const dv = new DataView(ihdrData.buffer);
  dv.setUint32(0, width); dv.setUint32(4, height);
  ihdrData[8] = 8; ihdrData[9] = 2;
  const ihdr = chunk('IHDR', ihdrData);

  const rowLen = 1 + width * 3;
  const raw = new Uint8Array(rowLen * height);
  const dotColor = label === 'A' ? [230, 119, 34] : [30, 41, 59]; // saffron / ink
  const dotSize = Math.floor(width * 0.3);
  const dotX0 = Math.floor((width - dotSize) / 2);
  const dotY0 = Math.floor((height - dotSize) / 2);

  for (let y = 0; y < height; y++) {
    const off = y * rowLen;
    raw[off] = 0;
    for (let x = 0; x < width; x++) {
      const p = off + 1 + x * 3;
      const inDot = x >= dotX0 && x < dotX0 + dotSize && y >= dotY0 && y < dotY0 + dotSize;
      const [r, g, b] = inDot ? dotColor : [255, 255, 255];
      raw[p] = r; raw[p + 1] = g; raw[p + 2] = b;
    }
  }

  const idat = chunk('IDAT', new Uint8Array(deflateSync(Buffer.from(raw))));
  const iend = chunk('IEND', new Uint8Array(0));
  const out = new Uint8Array(sig.length + ihdr.length + idat.length + iend.length);
  let off = 0;
  out.set(sig, off); off += sig.length;
  out.set(ihdr, off); off += ihdr.length;
  out.set(idat, off); off += idat.length;
  out.set(iend, off);
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const len = data.length;
  const out = new Uint8Array(8 + len + 4);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, len);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crcInput = out.subarray(4, 8 + len);
  dv.setUint32(8 + len, crc32(crcInput));
  return out;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

async function main() {
  for (const specId of ['seva-51', 'physical-35x45'] as const) {
    const spec = PHOTO_SPECS[specId];
    const w = mmToPx(spec.widthMm, spec.dpi);
    const h = mmToPx(spec.heightMm, spec.dpi);
    const png = makePngWithDot(w, h, specId === 'seva-51' ? 'A' : 'B');
    const pdf = await buildA4Sheet(png, spec);
    const filename = `/home/claude/passport-photo/sample-${specId}.pdf`;
    writeFileSync(filename, pdf);
    console.log(`Wrote ${filename} (${pdf.length} bytes)`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
