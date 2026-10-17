import type { PDFDocument, PDFPage } from "pdf-lib";

// pdf-lib resolves only from this app (ADR-045); other apps take its types from here.
export type { PDFDocument, PDFFont, PDFPage } from "pdf-lib";
import { PageSize, image_page, oriented_matrix, stamp_geometry, text_origin, displayed_size, type Placement } from "./geometry";
import { normalize_rotation, type PageItem } from "./pages";
import type { Signature } from "./stroke";

export class EncryptedPdfError extends Error {
  constructor(name: string) {
    super(`“${name}” is protected with a password. PDF Tools can't change encrypted PDFs; remove the password first.`);
    this.name = "EncryptedPdfError";
  }
}

let lib: Promise<typeof import("pdf-lib")> | null = null;

export function pdf_lib(): Promise<typeof import("pdf-lib")> {
  return (lib ??= import("pdf-lib"));
}

export async function load_pdf(bytes: Uint8Array, name = "This PDF"): Promise<PDFDocument> {
  const { PDFDocument } = await pdf_lib();
  try {
    return await PDFDocument.load(bytes, { updateMetadata: false });
  } catch (error) {
    // pdf-lib's ES5 build breaks `instanceof EncryptedPDFError`; its message is the only reliable signal.
    if (error instanceof Error && /\bis encrypted\b/.test(error.message)) throw new EncryptedPdfError(name);
    throw new Error(`“${name}” couldn't be read as a PDF.`, { cause: error });
  }
}

export async function page_count(bytes: Uint8Array, name?: string): Promise<number> {
  return (await load_pdf(bytes, name)).getPageCount();
}

async function save(document: PDFDocument): Promise<Uint8Array> {
  return document.save({ addDefaultPage: false });
}

/** Builds one PDF a source at a time, so each PDF or image can be its own task. */
export class PdfWriter {
  private document: Promise<PDFDocument> | null = null;

  private out(): Promise<PDFDocument> {
    return (this.document ??= pdf_lib().then(({ PDFDocument }) => PDFDocument.create()));
  }

  /** Appends every page of a PDF and resolves how many. */
  async append(bytes: Uint8Array, name?: string): Promise<number> {
    const out = await this.out();
    const document = await load_pdf(bytes, name);
    for (const page of await out.copyPages(document, document.getPageIndices())) out.addPage(page);
    return document.getPageCount();
  }

  async append_image(image: PdfImage, size: PageSize, margin: number): Promise<void> {
    const out = await this.out();
    const embedded = image.kind === "png" ? await out.embedPng(image.bytes) : await out.embedJpg(image.bytes);
    const layout = image_page(image.width, image.height, size, margin);
    const page = out.addPage([layout.width, layout.height]);
    if ((image.orientation ?? 1) === 1) return void page.drawImage(embedded, layout.image);
    const { concatTransformationMatrix, drawObject, popGraphicsState, pushGraphicsState } = await pdf_lib();
    const name = page.node.newXObject("Image", embedded.ref);
    page.pushOperators(
      pushGraphicsState(),
      concatTransformationMatrix(...oriented_matrix(image.orientation ?? 1, layout.image)),
      drawObject(name),
      popGraphicsState()
    );
  }

  /** Adds a blank page of this size in points and hands it to `draw`, with the document to embed images and fonts in. */
  async append_page(width: number, height: number, draw: (page: PDFPage, document: PDFDocument) => Promise<void>): Promise<void> {
    const out = await this.out();
    await draw(out.addPage([width, height]), out);
  }

  async finish(): Promise<Uint8Array> {
    return save(await this.out());
  }
}

export async function merge_pdfs(sources: { name: string; bytes: Uint8Array }[]): Promise<Uint8Array> {
  const writer = new PdfWriter();
  for (const source of sources) await writer.append(source.bytes, source.name);
  return writer.finish();
}

function shown_size(page: PDFPage): [number, number] {
  const { width, height } = page.getSize();
  return normalize_rotation(page.getRotation().angle) % 180 === 0 ? [width, height] : [height, width];
}

const A4: [number, number] = [595.28, 841.89];

export async function organize_pdf(bytes: Uint8Array, pages: PageItem[], name?: string): Promise<Uint8Array> {
  const { PDFDocument, degrees } = await pdf_lib();
  const source = await load_pdf(bytes, name);
  const out = await PDFDocument.create();
  const used = [...new Set(pages.flatMap((page) => (page.source === null ? [] : [page.source])))];
  const copied = new Map((await out.copyPages(source, used)).map((page, index) => [used[index], page]));
  let last_size: [number, number] | null = null;

  for (const [index, item] of pages.entries()) {
    if (item.source === null) {
      const next = pages.slice(index + 1).find((page) => page.source !== null);
      const size = last_size ?? (next?.source != null ? shown_size(copied.get(next.source)!) : A4);
      const blank = out.addPage(size);
      if (item.rotation) blank.setRotation(degrees(item.rotation));
      continue;
    }
    const page = out.addPage(copied.get(item.source)!);
    const rotation = normalize_rotation(page.getRotation().angle + item.rotation);
    page.setRotation(degrees(rotation));
    last_size = shown_size(page);
  }
  return save(out);
}

/** Cuts parts out of one PDF, loading it once on the first part. */
export class PdfSplitter {
  private source: Promise<PDFDocument> | null = null;

  constructor(
    private readonly bytes: Uint8Array,
    private readonly name?: string
  ) {}

  async part(pages: number[]): Promise<Uint8Array> {
    const { PDFDocument } = await pdf_lib();
    const source = await (this.source ??= load_pdf(this.bytes, this.name));
    const out = await PDFDocument.create();
    for (const page of await out.copyPages(source, pages.map((page) => page - 1))) out.addPage(page);
    return save(out);
  }
}

export async function* split_pdf(bytes: Uint8Array, groups: number[][], name?: string): AsyncGenerator<{ pages: number[]; bytes: Uint8Array }> {
  const splitter = new PdfSplitter(bytes, name);
  for (const pages of groups) yield { pages, bytes: await splitter.part(pages) };
}

export const Ink = { BLACK: "black", BLUE: "blue" } as const;
export type Ink = (typeof Ink)[keyof typeof Ink];

// Printed content, not UI: the same in every theme.
export const INK_RGB: Record<Ink, [number, number, number]> = {
  black: [0.05, 0.05, 0.07],
  blue: [0.06, 0.16, 0.48],
};

export function ink_css(ink: Ink): string {
  const [r, g, b] = INK_RGB[ink].map((value) => Math.round(value * 255));
  return `rgb(${r} ${g} ${b})`;
}

export interface SignStamp {
  page: number;
  placement: Placement;
  signature: Signature;
  ink: Ink;
  date: string | null;
}

export const DATE_SCALE = 0.22;

export async function sign_pdf(bytes: Uint8Array, stamps: SignStamp[], name?: string): Promise<Uint8Array> {
  const { StandardFonts, degrees, rgb } = await pdf_lib();
  const document = await load_pdf(bytes, name);
  const font = stamps.some((stamp) => stamp.date) ? await document.embedFont(StandardFonts.Helvetica) : null;

  for (const stamp of stamps) {
    const page = document.getPage(stamp.page);
    const box = page.getCropBox();
    const rotation = normalize_rotation(page.getRotation().angle);
    const { signature, placement } = stamp;
    const color = rgb(...INK_RGB[stamp.ink]);
    const geometry = stamp_geometry(box, rotation, placement, signature.width, signature.x, signature.y);
    page.drawSvgPath(signature.d, { x: geometry.x, y: geometry.y, scale: geometry.scale, rotate: degrees(geometry.rotate), color });

    if (stamp.date && font) {
      const shown = displayed_size(box, rotation);
      const height = signature.height * geometry.scale;
      const size = Math.max(6, Math.min(14, height * DATE_SCALE));
      const origin = text_origin(box, rotation, placement.x * shown.width, placement.y * shown.height + height + size * 0.2, size);
      page.drawText(stamp.date, { x: origin.x, y: origin.y, size, font, color, rotate: degrees(rotation) });
    }
  }
  return save(document);
}

export interface PdfImage {
  bytes: Uint8Array;
  kind: "png" | "jpg";
  /** Displayed size: the browser decodes JPEGs upright. */
  width: number;
  height: number;
  /** EXIF orientation of `bytes`, 1 to 8; the page draws them upright. */
  orientation?: number;
}

export async function images_to_pdf(images: PdfImage[], size: PageSize, margin: number): Promise<Uint8Array> {
  const writer = new PdfWriter();
  for (const image of images) await writer.append_image(image, size, margin);
  return writer.finish();
}
