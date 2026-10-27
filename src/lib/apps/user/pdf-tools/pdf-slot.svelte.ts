import { close_loaded, load_source, type LoadedPdf } from "./loaded";
import { source_at, type SourceFile } from "$kit/components/drop-zone";
import { EncryptedPdfError } from "./pdf";
import { is_pdf } from "./pdf-files";
import { error_message } from "$lib/core/utils";

export interface SlotError {
  title: string;
  message: string;
  locked: boolean;
}

export class PdfSlot {
  loaded = $state.raw<LoadedPdf | null>(null);
  loading = $state(false);
  error = $state.raw<SlotError | null>(null);
  private token = 0;

  async open(source: SourceFile | string): Promise<boolean> {
    const token = ++this.token;
    this.loading = true;
    this.error = null;
    try {
      const file = typeof source === "string" ? await source_at(source) : source;
      if (!is_pdf(file)) throw new Error(`“${file.name}” isn't a PDF.`);
      const next = await load_source(file);
      if (token !== this.token) {
        close_loaded(next);
        return false;
      }
      close_loaded(this.loaded);
      this.loaded = next;
      return true;
    } catch (error) {
      if (token !== this.token) return false;
      const locked = error instanceof EncryptedPdfError;
      this.error = {
        title: locked ? "This PDF is locked" : "Couldn't open the PDF",
        message: error_message(error),
        locked,
      };
      return false;
    } finally {
      if (token === this.token) this.loading = false;
    }
  }

  close(): void {
    this.token++;
    close_loaded(this.loaded);
    this.loaded = null;
    this.error = null;
    this.loading = false;
  }
}
