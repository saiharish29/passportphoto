import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { mmToPt, type PhotoSpec } from './photo-spec';

/**
 * A4 paper dimensions in mm.
 * 210 × 297. Inkjet/laser printers typically reserve ~5mm unprintable margin.
 */
const A4_WIDTH_MM = 210;
const A4_HEIGHT_MM = 297;

/** Outer margin around the grid in mm. */
const PAGE_MARGIN_MM = 8;

/** Gap between adjacent photos in mm — leaves room for scissors. */
const GUTTER_MM = 4;

export interface SheetLayout {
  cols: number;
  rows: number;
  cellWidthMm: number;
  cellHeightMm: number;
  gridLeftMm: number;
  gridTopMm: number;
}

/**
 * Compute the largest grid that fits on A4 for a given photo spec.
 * For 51×51mm: fits 3 cols × 4 rows = 12 photos.
 * For 35×45mm: fits 5 cols × 5 rows = 25 photos. (We cap at 4 rows to leave room
 * for crop instructions; users rarely need more than 20.)
 */
export function computeSheetLayout(spec: PhotoSpec): SheetLayout {
  const usableWidth = A4_WIDTH_MM - 2 * PAGE_MARGIN_MM;
  const usableHeight = A4_HEIGHT_MM - 2 * PAGE_MARGIN_MM - 18; // 18mm reserved at bottom for instructions

  const cols = Math.floor((usableWidth + GUTTER_MM) / (spec.widthMm + GUTTER_MM));
  const rows = Math.floor((usableHeight + GUTTER_MM) / (spec.heightMm + GUTTER_MM));

  const gridWidthMm = cols * spec.widthMm + (cols - 1) * GUTTER_MM;
  const gridHeightMm = rows * spec.heightMm + (rows - 1) * GUTTER_MM;

  return {
    cols,
    rows,
    cellWidthMm: spec.widthMm,
    cellHeightMm: spec.heightMm,
    // Centre the grid horizontally
    gridLeftMm: (A4_WIDTH_MM - gridWidthMm) / 2,
    // Top of the grid in mm-from-top — small offset from page margin
    gridTopMm: PAGE_MARGIN_MM,
    // Stash for tests
    ...({ gridWidthMm, gridHeightMm } as object),
  };
}

/**
 * Generate an A4 PDF sheet with the given photo image (PNG bytes) tiled
 * `cols × rows` times, with crop marks at each corner of every photo.
 *
 * @param pngBytes PNG-encoded passport photo, exactly spec dimensions × DPI.
 * @param spec     The photo spec used.
 * @returns        Uint8Array of the PDF file.
 */
export async function buildA4Sheet(pngBytes: Uint8Array, spec: PhotoSpec): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle('Indian Passport Photos — A4 Print Sheet');
  pdf.setCreator('Passport Photo MVP');

  const page = pdf.addPage([mmToPt(A4_WIDTH_MM), mmToPt(A4_HEIGHT_MM)]);
  const layout = computeSheetLayout(spec);

  const image = await pdf.embedPng(pngBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);

  // pdf-lib uses bottom-left origin (PostScript convention).
  // We compute every position from the top in mm, then convert.
  const pageHeightPt = mmToPt(A4_HEIGHT_MM);

  for (let row = 0; row < layout.rows; row++) {
    for (let col = 0; col < layout.cols; col++) {
      const xMm = layout.gridLeftMm + col * (layout.cellWidthMm + GUTTER_MM);
      const yFromTopMm = layout.gridTopMm + row * (layout.cellHeightMm + GUTTER_MM);

      const xPt = mmToPt(xMm);
      // Convert from "top-down in mm" to "bottom-up in pt"
      const yPt = pageHeightPt - mmToPt(yFromTopMm + layout.cellHeightMm);

      page.drawImage(image, {
        x: xPt,
        y: yPt,
        width: mmToPt(layout.cellWidthMm),
        height: mmToPt(layout.cellHeightMm),
      });

      // Crop marks: 3mm L-shaped marks at each corner, offset 1mm outside the photo
      drawCropMarks(page, {
        leftMm: xMm,
        topMm: yFromTopMm,
        widthMm: layout.cellWidthMm,
        heightMm: layout.cellHeightMm,
        pageHeightMm: A4_HEIGHT_MM,
      });
    }
  }

  // Footer instruction
  const footerY = mmToPt(8); // 8mm from bottom
  page.drawText(
    `Print at 100% scale (no "fit to page"). ${spec.label}. Cut along marks.`,
    {
      x: mmToPt(PAGE_MARGIN_MM),
      y: footerY,
      size: 8,
      font,
      color: rgb(0.3, 0.3, 0.3),
    },
  );

  return pdf.save();
}

interface CropMarkParams {
  leftMm: number;
  topMm: number;
  widthMm: number;
  heightMm: number;
  pageHeightMm: number;
}

/** Draw 3mm L-shaped crop marks just outside each corner of the photo. */
function drawCropMarks(
  page: import('pdf-lib').PDFPage,
  { leftMm, topMm, widthMm, heightMm, pageHeightMm }: CropMarkParams,
) {
  const markLenMm = 3;
  const offsetMm = 0.5;
  const thicknessPt = 0.4;
  const color = rgb(0.4, 0.4, 0.4);

  const right = leftMm + widthMm;
  const bottom = topMm + heightMm;

  // For each corner, two perpendicular lines.
  const lines: Array<[number, number, number, number]> = [
    // Top-left
    [leftMm - offsetMm - markLenMm, topMm, leftMm - offsetMm, topMm],
    [leftMm, topMm - offsetMm - markLenMm, leftMm, topMm - offsetMm],
    // Top-right
    [right + offsetMm, topMm, right + offsetMm + markLenMm, topMm],
    [right, topMm - offsetMm - markLenMm, right, topMm - offsetMm],
    // Bottom-left
    [leftMm - offsetMm - markLenMm, bottom, leftMm - offsetMm, bottom],
    [leftMm, bottom + offsetMm, leftMm, bottom + offsetMm + markLenMm],
    // Bottom-right
    [right + offsetMm, bottom, right + offsetMm + markLenMm, bottom],
    [right, bottom + offsetMm, right, bottom + offsetMm + markLenMm],
  ];

  for (const [x1, y1, x2, y2] of lines) {
    page.drawLine({
      start: { x: mmToPt(x1), y: mmToPt(pageHeightMm - y1) },
      end: { x: mmToPt(x2), y: mmToPt(pageHeightMm - y2) },
      thickness: thicknessPt,
      color,
    });
  }
}
