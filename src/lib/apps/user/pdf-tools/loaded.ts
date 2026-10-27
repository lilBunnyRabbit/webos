import { load_pdf } from "./pdf";
import type { SourceFile } from "$kit/components/drop-zone";
import { read_bytes } from "./pdf-files";
import { open_document, type PdfDocument } from "./render";

export interface LoadedPdf {
  source: SourceFile;
  bytes: Uint8Array;
  document: PdfDocument;
  count: number;
}

// pdf-lib is loaded too, even for rendering only: pdf.js shows owner-locked PDFs that pdf-lib then refuses to write.
export async function load_source(source: SourceFile): Promise<LoadedPdf> {
  const bytes = await read_bytes(source);
  const checked = await load_pdf(bytes, source.name);
  const document = await open_document(bytes, source.name);
  return { source, bytes, document, count: checked.getPageCount() };
}

export function close_loaded(loaded: LoadedPdf | null): void {
  void loaded?.document.loadingTask.destroy();
}
