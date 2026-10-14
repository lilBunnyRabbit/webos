import { SvelteMap } from "svelte/reactivity";
import { canvas_blob, render_width, type PdfDocument } from "./render";

// One page at a time, newest request first, so pages scrolled past don't hold up the ones on screen.
export class ThumbCache {
  readonly urls = new SvelteMap<number, string>();
  private readonly wanted = new Set<number>();
  private running = false;
  private destroyed = false;

  constructor(
    private readonly document: PdfDocument,
    private readonly width: number,
    private readonly paused: () => boolean
  ) {}

  want(index: number): void {
    if (this.urls.has(index)) return;
    this.wanted.delete(index);
    this.wanted.add(index);
    void this.pump();
  }

  unwant(index: number): void {
    this.wanted.delete(index);
  }

  async pump(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      while (!this.destroyed && !this.paused() && this.wanted.size) {
        const index = [...this.wanted].at(-1)!;
        this.wanted.delete(index);
        if (this.urls.has(index)) continue;
        try {
          const canvas = await render_width(this.document, index, this.width);
          const blob = await canvas_blob(canvas, "image/png");
          if (this.destroyed) return;
          this.urls.set(index, URL.createObjectURL(blob));
        } catch (error) {
          if (!this.destroyed) console.warn("[pdf-tools] Couldn't render page", index + 1, error);
        }
      }
    } finally {
      this.running = false;
    }
  }

  destroy(): void {
    this.destroyed = true;
    for (const url of this.urls.values()) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}
