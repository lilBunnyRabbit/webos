import type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { run_job, type JobUnit } from "$lib/apps/user/pdf-tools/job";
import { PdfWriter, pdf_lib } from "$lib/apps/user/pdf-tools/pdf";
import { write_at } from "$lib/apps/user/pdf-tools/pdf-files";
import kernel, { type AppsService } from "$lib/core/api";
import type { AppId } from "$lib/core/api/services/apps/type";
import { base_name } from "$lib/core/api/services/files/path";
import { format_bytes } from "$lib/core/utils";
import {
  MAP_FOOTER,
  MAP_MARGIN,
  format_mm,
  map_layout,
  tile_pixels,
  type Box,
  type PosterLayout,
  type PosterPaper,
  type PosterSheet,
  type Size,
} from "./poster";

const PT_PER_MM = 72 / 25.4;
const MAP_SIDE = 1400;
const JPEG_QUALITY = 0.92;
const PAPER_NAMES: Record<PosterPaper, string> = { a4: "A4", letter: "Letter", a3: "A3" };

export interface PosterJob {
  app_id: AppId;
  bitmap: ImageBitmap;
  name: string;
  paper: PosterPaper;
  layout: PosterLayout;
  marks: boolean;
  map: boolean;
  target: string;
  signal?: AbortSignal;
}

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

// Printed content, not UI: paper is white and ink is black in every theme.
async function jpeg(bitmap: ImageBitmap, source: Box, size: Size): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(size.width, size.height);
  const context = canvas.getContext("2d")!;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, size.width, size.height);
  const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: JPEG_QUALITY });
  canvas.width = canvas.height = 0;
  return new Uint8Array(await blob.arrayBuffer());
}

/** Helvetica only has WinAnsi glyphs; anything else in a file name would make pdf-lib throw. */
function printable(text: string): string {
  return text.replace(/[^\x20-\x7e\xa0-\xff]/g, "?");
}

function pt(page: PDFPage) {
  const height = page.getHeight();
  return {
    x: (mm: number) => mm * PT_PER_MM,
    y: (mm: number) => height - mm * PT_PER_MM,
  };
}

async function draw_marks(page: PDFPage, sheet: PosterSheet, layout: PosterLayout): Promise<void> {
  const { rgb } = await pdf_lib();
  const to = pt(page);
  const { margin, overlap } = layout;
  const length = Math.min(5, margin - 1.5);
  if (length < 1) return;
  const left = margin;
  const top = margin;
  const right = margin + sheet.printed.width;
  const bottom = margin + sheet.printed.height;
  const color = rgb(0, 0, 0);
  const line = (x1: number, y1: number, x2: number, y2: number, dashed = false) =>
    page.drawLine({
      start: { x: to.x(x1), y: to.y(y1) },
      end: { x: to.x(x2), y: to.y(y2) },
      thickness: 0.4,
      color,
      dashArray: dashed ? [2, 1.5] : undefined,
    });

  for (const x of [left, right]) {
    line(x, top - 1, x, top - 1 - length);
    line(x, bottom + 1, x, bottom + 1 + length);
  }
  for (const y of [top, bottom]) {
    line(left - 1, y, left - 1 - length, y);
    line(right + 1, y, right + 1 + length, y);
  }
  if (overlap <= 0) return;
  // Where the next sheet's trimmed edge lands.
  if (sheet.joins.right) {
    const x = right - overlap;
    line(x, top - 1, x, top - 1 - length, true);
    line(x, bottom + 1, x, bottom + 1 + length, true);
  }
  if (sheet.joins.bottom) {
    const y = bottom - overlap;
    line(left - 1, y, left - 1 - length, y, true);
    line(right + 1, y, right + 1 + length, y, true);
  }
}

async function draw_label(page: PDFPage, fonts: Fonts, sheet: PosterSheet, layout: PosterLayout, name: string): Promise<void> {
  const { rgb } = await pdf_lib();
  const to = pt(page);
  const size = Math.min(10, Math.max(6, layout.margin * PT_PER_MM * 0.42));
  const baseline = to.y(layout.sheet.height - layout.margin / 2) - size * 0.35;
  const color = rgb(0, 0, 0);
  // Inset so the text clears the crop marks running down from the image's corners.
  const x = to.x(layout.margin + 2);
  const right = to.x(layout.sheet.width - layout.margin - 2);
  page.drawText(sheet.label, { x, y: baseline, size, font: fonts.bold, color });

  const room = right - x - fonts.bold.widthOfTextAtSize(sheet.label, size) - size;
  const place = `Row ${sheet.row + 1} of ${layout.rows} · Column ${sheet.column + 1} of ${layout.columns}`;
  const detail = [`${place} · ${printable(name)}`, place].find((text) => fonts.regular.widthOfTextAtSize(text, size) <= room);
  if (!detail) return;
  const width = fonts.regular.widthOfTextAtSize(detail, size);
  page.drawText(detail, { x: right - width, y: baseline, size, font: fonts.regular, color });
}

async function draw_map(page: PDFPage, document: PDFDocument, fonts: Fonts, job: PosterJob): Promise<void> {
  const { rgb } = await pdf_lib();
  const { layout, bitmap } = job;
  const map = map_layout(layout, job.paper);
  const to = pt(page);
  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);
  const grey = rgb(0.45, 0.45, 0.45);

  page.drawText(printable(job.name), { x: to.x(MAP_MARGIN), y: to.y(MAP_MARGIN) - 14, size: 14, font: fonts.bold, color: black });
  const orientation = layout.sheet.width > layout.sheet.height ? "landscape" : "portrait";
  const summary = [
    `${layout.columns} × ${layout.rows} sheets of ${PAPER_NAMES[job.paper]} ${orientation}`,
    `${format_mm(layout.poster.width)} × ${format_mm(layout.poster.height)}`,
    `${Math.round(layout.dpi)} DPI`,
    layout.overlap > 0 ? `${format_mm(layout.overlap)} overlap` : "no overlap",
  ].join("  ·  ");
  page.drawText(summary, { x: to.x(MAP_MARGIN), y: to.y(MAP_MARGIN) - 28, size: 9, font: fonts.regular, color: grey });

  const scale = Math.min(1, MAP_SIDE / Math.max(bitmap.width, bitmap.height));
  const preview = { width: Math.max(1, Math.round(bitmap.width * scale)), height: Math.max(1, Math.round(bitmap.height * scale)) };
  const image = await document.embedJpg(await jpeg(bitmap, { x: 0, y: 0, width: bitmap.width, height: bitmap.height }, preview));
  const box = (rect: Box) => ({ x: to.x(rect.x), y: to.y(rect.y + rect.height), width: rect.width * PT_PER_MM, height: rect.height * PT_PER_MM });
  page.drawRectangle({ ...box(map.grid), borderColor: grey, borderWidth: 0.5, borderDashArray: [3, 2] });
  page.drawImage(image, box(map.image));

  for (const cell of map.cells) {
    page.drawRectangle({ ...box(cell), borderColor: white, borderWidth: 2 });
    page.drawRectangle({ ...box(cell), borderColor: black, borderWidth: 0.75 });
  }
  for (const cell of map.cells) {
    const size = Math.min(24, Math.max(6, Math.min(cell.width, cell.height) * PT_PER_MM * 0.22));
    const width = fonts.bold.widthOfTextAtSize(cell.label, size);
    const center = { x: to.x(cell.x + cell.width / 2), y: to.y(cell.y + cell.height / 2) };
    const pad = size * 0.3;
    page.drawRectangle({
      x: center.x - width / 2 - pad,
      y: center.y - size / 2 - pad,
      width: width + pad * 2,
      height: size + pad * 2,
      color: white,
      opacity: 0.85,
    });
    page.drawText(cell.label, { x: center.x - width / 2, y: center.y - size * 0.35, size, font: fonts.bold, color: black });
  }

  const steps = [
    "Print at actual size (100%), not fit to page. Letters are columns, numbers are rows.",
    !job.marks
      ? "Trim the white margins, then join the sheets as laid out above."
      : layout.overlap > 0
        ? "Trim each sheet's left and top edge at the crop marks, then lay it over its neighbours up to the dashed marks."
        : "Trim every sheet at the crop marks and butt the edges together.",
  ];
  const footer = map.page.height - MAP_MARGIN - MAP_FOOTER + 8;
  for (const [index, text] of steps.entries()) {
    page.drawText(text, { x: to.x(MAP_MARGIN), y: to.y(footer) - index * 13, size: 9, font: fonts.regular, color: black, maxWidth: (map.page.width - MAP_MARGIN * 2) * PT_PER_MM });
  }
}

export function write_poster(job: PosterJob): Promise<boolean> {
  const { layout } = job;
  const count = layout.sheets.length;
  return run_job(
    job.app_id,
    `Making a ${count}-sheet poster`,
    () => {
      const writer = new PdfWriter();
      let fonts: Promise<Fonts> | null = null;
      const fonts_for = (document: PDFDocument) =>
        (fonts ??= pdf_lib().then(async ({ StandardFonts }) => ({
          regular: await document.embedFont(StandardFonts.Helvetica),
          bold: await document.embedFont(StandardFonts.HelveticaBold),
        })));
      const sheet_size = { width: layout.sheet.width * PT_PER_MM, height: layout.sheet.height * PT_PER_MM };

      const units: JobUnit[] = layout.sheets.map((sheet) => ({
        name: `Sheet ${sheet.label}`,
        async run() {
          const pixels = tile_pixels(sheet, layout.dpi);
          await writer.append_page(sheet_size.width, sheet_size.height, async (page, document) => {
            const to = pt(page);
            const image = await document.embedJpg(await jpeg(job.bitmap, sheet.source, pixels));
            page.drawImage(image, {
              x: to.x(layout.margin),
              y: to.y(layout.margin + sheet.printed.height),
              width: sheet.printed.width * PT_PER_MM,
              height: sheet.printed.height * PT_PER_MM,
            });
            if (job.marks) await draw_marks(page, sheet, layout);
            await draw_label(page, await fonts_for(document), sheet, layout, job.name);
          });
          return `${pixels.width}×${pixels.height} px`;
        },
      }));
      if (job.map) {
        const page = map_layout(layout, job.paper).page;
        units.unshift({
          name: "Assembly map",
          run: () =>
            writer.append_page(page.width * PT_PER_MM, page.height * PT_PER_MM, async (map, document) =>
              draw_map(map, document, await fonts_for(document), job)
            ),
        });
      }
      units.push({
        name: "Write PDF",
        async run() {
          const bytes = await writer.finish();
          await write_at(job.target, bytes);
          return `Saved ${format_bytes(bytes.byteLength)}`;
        },
      });
      return units;
    },
    () => ({
      title: "Poster saved",
      message: base_name(job.target),
      actions: [{ label: "Open", on_click: () => void kernel.service<AppsService>("apps").open(job.target) }],
    }),
    job.signal
  );
}
