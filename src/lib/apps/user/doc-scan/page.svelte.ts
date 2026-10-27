import { default_quad, type Quad } from "$kit/utils/perspective";
import { error_message } from "$lib/core/utils";
import { detect, straighten } from "./process";
import { PageFilter } from "./warp";

export class ScanPage {
  readonly id = crypto.randomUUID();
  readonly url: string;
  width = $state(0);
  height = $state(0);
  quad = $state.raw<Quad | null>(null);
  /** The corners `detect` found, so "Find edges" can put them back. */
  found = $state.raw<Quad | null>(null);
  filter = $state<PageFilter>(PageFilter.COLOR);
  result = $state.raw<Blob | null>(null);
  result_url = $state<string | null>(null);
  busy = $state(false);
  error = $state<string | null>(null);
  private rendered: { quad: Quad; filter: PageFilter } | null = null;
  private version = 0;

  constructor(
    readonly source: Blob,
    readonly name: string,
    filter: PageFilter
  ) {
    this.url = URL.createObjectURL(source);
    this.filter = filter;
  }

  get ready(): boolean {
    return this.quad !== null;
  }

  get current(): boolean {
    return this.result !== null && this.rendered?.quad === this.quad && this.rendered.filter === this.filter;
  }

  async prepare(): Promise<void> {
    this.busy = true;
    try {
      const detected = await detect(this.source);
      this.width = detected.width;
      this.height = detected.height;
      this.found = detected.quad;
      this.quad = detected.quad ?? default_quad(detected.width, detected.height);
    } catch (error) {
      this.busy = false;
      this.error = error_message(error);
      return;
    }
    await this.render();
  }

  whole(): void {
    this.quad = [
      { x: 0, y: 0 },
      { x: this.width, y: 0 },
      { x: this.width, y: this.height },
      { x: 0, y: this.height },
    ];
  }

  edges(): void {
    this.quad = this.found ?? default_quad(this.width, this.height);
  }

  /** A newer call wins over one still running. */
  async render(): Promise<Blob | null> {
    if (!this.quad) return null;
    if (this.current) return this.result;
    const version = ++this.version;
    const wanted = { quad: this.quad, filter: this.filter };
    this.busy = true;
    try {
      const { blob } = await straighten(this.source, wanted.quad, wanted.filter);
      if (version !== this.version) return null;
      this.set_result(blob);
      this.rendered = wanted;
      this.error = null;
      return blob;
    } catch (error) {
      if (version === this.version) this.error = error_message(error);
      return null;
    } finally {
      if (version === this.version) this.busy = false;
    }
  }

  private set_result(blob: Blob): void {
    if (this.result_url) URL.revokeObjectURL(this.result_url);
    this.result = blob;
    this.result_url = URL.createObjectURL(blob);
  }

  dispose(): void {
    this.version++;
    URL.revokeObjectURL(this.url);
    if (this.result_url) URL.revokeObjectURL(this.result_url);
  }
}
