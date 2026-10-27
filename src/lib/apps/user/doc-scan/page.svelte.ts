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
  private pending: { quad: Quad; filter: PageFilter; done: Promise<Blob | null> } | null = null;
  private preparing: Promise<void> | null = null;
  private version = 0;
  private is_disposed = false;

  constructor(
    readonly source: Blob,
    readonly name: string,
    filter: PageFilter
  ) {
    this.url = URL.createObjectURL(source);
    this.filter = filter;
  }

  get disposed(): boolean {
    return this.is_disposed;
  }

  get ready(): boolean {
    return this.quad !== null;
  }

  get current(): boolean {
    return this.result !== null && this.rendered?.quad === this.quad && this.rendered.filter === this.filter;
  }

  /** Finds the edges and renders once; every caller gets the same run. */
  prepare(): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return (this.preparing ??= this.detect_and_render());
  }

  private async detect_and_render(): Promise<void> {
    this.busy = true;
    try {
      const detected = await detect(this.source);
      if (this.disposed) return;
      this.width = detected.width;
      this.height = detected.height;
      this.found = detected.quad;
      this.quad = detected.quad ?? default_quad(detected.width, detected.height);
    } catch (error) {
      if (this.disposed) return;
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

  /** Resolves with the page as it is when the last render started: a call overtaken by a newer one follows it. */
  async render(): Promise<Blob | null> {
    if (this.disposed || !this.quad) return null;
    if (this.current) return this.result;
    if (this.pending && this.pending.quad === this.quad && this.pending.filter === this.filter) return this.pending.done;
    const version = ++this.version;
    const wanted = { quad: this.quad, filter: this.filter };
    const done = this.straighten(version, wanted);
    this.pending = { ...wanted, done };
    return done;
  }

  private async straighten(version: number, wanted: { quad: Quad; filter: PageFilter }): Promise<Blob | null> {
    this.busy = true;
    try {
      const { blob } = await straighten(this.source, wanted.quad, wanted.filter);
      if (this.disposed) return null;
      if (version !== this.version) return this.render();
      this.set_result(blob);
      this.rendered = wanted;
      this.error = null;
      return blob;
    } catch (error) {
      if (this.disposed) return null;
      if (version !== this.version) return this.render();
      this.error = error_message(error);
      return null;
    } finally {
      if (version === this.version) {
        this.busy = false;
        this.pending = null;
      }
    }
  }

  private set_result(blob: Blob): void {
    if (this.result_url) URL.revokeObjectURL(this.result_url);
    this.result = blob;
    this.result_url = URL.createObjectURL(blob);
  }

  dispose(): void {
    this.is_disposed = true;
    this.version++;
    URL.revokeObjectURL(this.url);
    if (this.result_url) URL.revokeObjectURL(this.result_url);
  }
}
