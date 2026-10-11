const BITMAP_BUDGET = 256 * 1024 * 1024;

/** A zero delay means "as fast as possible", which browsers play at 100ms. */
const DEFAULT_DELAY_MS = 100;

export interface WarmupProgress {
  done: number;
  total: number;
}

/**
 * Random access to the frames of a GIF through WebCodecs' `ImageDecoder`, which composites disposal and transparency
 * natively. Decoded frames are kept as `ImageBitmap`s in an LRU within a fixed memory budget.
 */
export class GifDecoder {
  readonly width: number;
  readonly height: number;
  readonly frame_count: number;
  /** Per-frame delay in ms. Frames not decoded yet hold the default. */
  readonly delays: number[];

  #decoder: ImageDecoder;
  #bitmaps = new Map<number, ImageBitmap>();
  #max_bitmaps: number;
  #latest_draw = -1;
  #closed = false;

  private constructor(decoder: ImageDecoder, first: VideoFrame) {
    this.#decoder = decoder;
    this.width = first.displayWidth;
    this.height = first.displayHeight;
    this.frame_count = decoder.tracks.selectedTrack?.frameCount ?? 1;
    this.delays = Array.from({ length: this.frame_count }, () => DEFAULT_DELAY_MS);
    this.#max_bitmaps = Math.floor(BITMAP_BUDGET / (this.width * this.height * 4));
  }

  static async open(file: File): Promise<GifDecoder> {
    const decoder = new ImageDecoder({ data: await file.arrayBuffer(), type: "image/gif" });
    try {
      await decoder.tracks.ready;
      await decoder.completed;
      const { image } = await decoder.decode({ frameIndex: 0 });
      const gif = new GifDecoder(decoder, image);
      await gif.#store(0, image);
      if (!gif.width || !gif.height) throw new Error(`Invalid GIF dimensions: ${gif.width}×${gif.height}`);
      return gif;
    } catch (error) {
      decoder.close();
      throw error;
    }
  }

  /** Draws frame `index`. A slower, older request that finishes after a newer one is dropped. */
  async draw(index: number, context: CanvasRenderingContext2D): Promise<void> {
    this.#latest_draw = index;
    const paint = (source: CanvasImageSource) => {
      if (this.#closed || index !== this.#latest_draw) return;
      context.clearRect(0, 0, this.width, this.height);
      context.drawImage(source, 0, 0);
    };

    const cached = this.#bitmaps.get(index);
    if (cached) {
      this.#bitmaps.delete(index);
      this.#bitmaps.set(index, cached);
      return paint(cached);
    }
    // Paint the VideoFrame itself: the bitmap made from it can be evicted by a concurrent warmup before we'd draw it.
    await this.#decode(index, paint);
  }

  /** Decodes every frame in order, so delays are known and bitmaps cached up to the budget. Stops on `close()`. */
  async warmup(onprogress: (progress: WarmupProgress) => void): Promise<void> {
    const total = this.frame_count;
    for (let index = 0; index < total; index++) {
      if (this.#closed) return;
      if (!this.#bitmaps.has(index)) {
        try {
          await this.#decode(index);
        } catch (error) {
          if (!this.#closed) console.warn(`[GifPlayer] frame ${index} failed to decode`, error);
        }
      }
      if ((index + 1) % 4 === 0 || index === total - 1) onprogress({ done: index + 1, total });
    }
  }

  close(): void {
    this.#closed = true;
    this.#decoder.close();
    for (const bitmap of this.#bitmaps.values()) bitmap.close();
    this.#bitmaps.clear();
  }

  async #decode(index: number, paint?: (frame: VideoFrame) => void): Promise<void> {
    if (this.#closed) return;
    const { image } = await this.#decoder.decode({ frameIndex: index });
    paint?.(image);
    await this.#store(index, image);
  }

  async #store(index: number, frame: VideoFrame): Promise<void> {
    const duration_ms = (frame.duration ?? 0) / 1000;
    this.delays[index] = duration_ms > 0 ? duration_ms : DEFAULT_DELAY_MS;
    try {
      const bitmap = await createImageBitmap(frame);
      if (this.#closed) bitmap.close();
      else this.#cache(index, bitmap);
    } finally {
      frame.close();
    }
  }

  #cache(index: number, bitmap: ImageBitmap): void {
    this.#bitmaps.get(index)?.close();
    this.#bitmaps.delete(index);
    while (this.#bitmaps.size > 0 && this.#bitmaps.size >= this.#max_bitmaps) {
      const [oldest, old] = this.#bitmaps.entries().next().value!;
      old.close();
      this.#bitmaps.delete(oldest);
    }
    this.#bitmaps.set(index, bitmap);
  }
}
