import worker_url from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { EncryptedPdfError } from "./pdf";

export type PdfDocument = PDFDocumentProxy;

let lib: Promise<typeof import("pdfjs-dist")> | null = null;

function pdfjs(): Promise<typeof import("pdfjs-dist")> {
  return (lib ??= import("pdfjs-dist").then((module) => {
    module.GlobalWorkerOptions.workerSrc = worker_url;
    return module;
  }));
}

export async function open_document(bytes: Uint8Array, name: string): Promise<PdfDocument> {
  const { getDocument } = await pdfjs();
  try {
    // pdf.js transfers the buffer to its worker; a copy keeps the caller's bytes usable for pdf-lib.
    return await getDocument({ data: bytes.slice() }).promise;
  } catch (error) {
    if (error instanceof Error && error.name === "PasswordException") throw new EncryptedPdfError(name);
    throw new Error(`“${name}” couldn't be read as a PDF.`, { cause: error });
  }
}

export interface PageInfo {
  width: number;
  height: number;
  rotation: number;
}

export async function page_info(document: PdfDocument, index: number): Promise<PageInfo> {
  const page = await document.getPage(index + 1);
  const viewport = page.getViewport({ scale: 1 });
  return { width: viewport.width, height: viewport.height, rotation: page.rotate };
}

export async function render_page(
  document: PdfDocument,
  index: number,
  scale: number,
  extra = 0
): Promise<HTMLCanvasElement> {
  const page = await document.getPage(index + 1);
  const viewport = page.getViewport({ scale, rotation: (page.rotate + extra) % 360 });
  const canvas = window.document.createElement("canvas");
  canvas.width = Math.max(1, Math.floor(viewport.width));
  canvas.height = Math.max(1, Math.floor(viewport.height));
  await page.render({ canvas, viewport, background: "white" }).promise;
  page.cleanup();
  return canvas;
}

export async function render_width(
  document: PdfDocument,
  index: number,
  width: number,
  extra = 0
): Promise<HTMLCanvasElement> {
  const page = await document.getPage(index + 1);
  const base = page.getViewport({ scale: 1, rotation: (page.rotate + extra) % 360 });
  return render_page(document, index, width / base.width, extra);
}

/** A canvas's pixels stay allocated until it's collected; zero size frees them as soon as the image is encoded. */
export function release_canvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

export function canvas_blob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't encode the image."))), type, quality)
  );
}
