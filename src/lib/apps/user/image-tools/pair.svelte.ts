import kernel, { NotificationType, type NotificationsService } from "$lib/core/api";
import { parent_path } from "$lib/core/api/services/files/path";
import type { WindowHandle } from "$lib/core/contexts/app/type";
import { error_message } from "$lib/core/utils";
import { load_image, load_image_at, read_pixels, type SourceImage } from "$lib/core/utils/image";
import { tolerance_level } from "./compare";
import { Pyramid, align, compare, coverage, find_regions, type Alignment, type Rect } from "./patch";

export const Slot = { ORIGINAL: "original", EDITED: "edited" } as const;
export type Slot = (typeof Slot)[keyof typeof Slot];

interface PairOptions {
  app_id: string;
  win: WindowHandle;
  titles: Record<Slot, string>;
  on_load?: (slot: Slot) => void;
  on_aligned?: () => void;
}

/** Coordinates are in the edited image's pixels: it is the frame the original is aligned into. */
export class ImagePair {
  images = $state.raw<Record<Slot, SourceImage | null>>({ original: null, edited: null });
  loading = $state.raw<Record<Slot, boolean>>({ original: false, edited: false });
  alignment = $state.raw<Alignment | null>(null);
  match = $state(0);
  aligning = $state(false);
  match_colors = $state(true);
  tolerance = $state(12);

  readonly original = $derived(this.images.original);
  readonly edited = $derived(this.images.edited);
  readonly original_pyramid = $derived(this.original ? new Pyramid(read_pixels(this.original.bitmap)) : null);
  readonly edited_pyramid = $derived(this.edited ? new Pyramid(read_pixels(this.edited.bitmap)) : null);
  readonly ready = $derived(
    this.original && this.edited && this.alignment ? { original: this.original, edited: this.edited, alignment: this.alignment } : null
  );
  readonly comparison = $derived(
    this.original_pyramid && this.edited_pyramid && this.alignment
      ? compare(this.original_pyramid, this.edited_pyramid, this.alignment, this.match_colors)
      : null
  );
  readonly regions = $derived(this.comparison ? find_regions(this.comparison.diff, tolerance_level(this.tolerance)) : []);
  readonly covered = $derived(this.ready ? coverage(this.ready.alignment, this.ready.original.bitmap, this.ready.edited.bitmap) : null);
  readonly uncovered = $derived.by((): Rect[] => {
    if (!this.edited || !this.ready) return [];
    const { width, height } = this.edited.bitmap;
    const covered = this.covered;
    if (!covered) return [{ x: 0, y: 0, width, height }];
    const right = covered.x + covered.width;
    const bottom = covered.y + covered.height;
    return [
      { x: 0, y: 0, width, height: covered.y },
      { x: 0, y: bottom, width, height: height - bottom },
      { x: 0, y: covered.y, width: covered.x, height: covered.height },
      { x: right, y: covered.y, width: width - right, height: covered.height },
    ].filter((rect) => rect.width > 0.5 && rect.height > 0.5);
  });
  readonly start_path = $derived.by(() => {
    const path = this.edited?.path ?? this.original?.path;
    return path ? parent_path(path) : undefined;
  });

  private readonly options: PairOptions;
  private readonly requests: Record<Slot, number> = { original: 0, edited: 0 };
  private align_request = 0;
  private destroyed = false;

  constructor(options: PairOptions) {
    this.options = options;
  }

  async load(slot: Slot, task: () => Promise<SourceImage>) {
    const id = ++this.requests[slot];
    this.loading = { ...this.loading, [slot]: true };
    try {
      const result = await task();
      if (this.destroyed || id !== this.requests[slot]) return result.bitmap.close();
      const previous = this.images[slot];
      this.images = { ...this.images, [slot]: result };
      previous?.bitmap.close();
      this.options.on_load?.(slot);
      this.realign();
    } catch (reason) {
      if (id === this.requests[slot]) {
        kernel
          .service<NotificationsService>("notifications")
          .notify(this.options.app_id, { type: NotificationType.ERROR, title: "Couldn't open the image", message: error_message(reason) });
      }
    } finally {
      if (id === this.requests[slot]) this.loading = { ...this.loading, [slot]: false };
    }
  }

  load_paths(paths: string[]) {
    if (paths[0]) this.load(Slot.ORIGINAL, () => load_image_at(paths[0]));
    if (paths[1]) this.load(Slot.EDITED, () => load_image_at(paths[1]));
  }

  async realign() {
    const id = ++this.align_request;
    if (!this.original_pyramid || !this.edited_pyramid) {
      this.alignment = null;
      return;
    }
    this.aligning = true;
    // Lets the spinner paint before the search holds the main thread for a moment.
    await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve)));
    if (id !== this.align_request) return;
    if (!this.original_pyramid || !this.edited_pyramid) {
      this.aligning = false;
      return;
    }
    const result = align(this.original_pyramid, this.edited_pyramid);
    this.alignment = result.alignment;
    this.match = result.match;
    this.aligning = false;
    this.options.on_aligned?.();
  }

  nudge(field: keyof Alignment, value: number | string | null | undefined) {
    const number = typeof value === "number" ? value : Number.parseFloat(value ?? "");
    if (!this.alignment || !Number.isFinite(number) || (field === "scale" && number <= 0)) return;
    this.alignment = { ...this.alignment, [field]: number };
  }

  async pick(slot: Slot) {
    const chosen = await this.options.win.pick_file({
      accept: ["image/*"],
      start_path: this.start_path,
      title: this.options.titles[slot],
      multiple: true,
    });
    // Two picked at once fill both slots, in the order the folder lists them.
    if (chosen.length >= 2) {
      this.load(Slot.ORIGINAL, () => load_image_at(chosen[0]));
      this.load(Slot.EDITED, () => load_image_at(chosen[1]));
      return;
    }
    const [path] = chosen;
    if (path) this.load(slot, () => load_image_at(path));
  }

  take(files: File[]) {
    if (files.length >= 2) {
      this.load(Slot.ORIGINAL, () => load_image(files[0]));
      this.load(Slot.EDITED, () => load_image(files[1]));
      return;
    }
    const [file] = files;
    if (file) this.load(this.images.original ? Slot.EDITED : Slot.ORIGINAL, () => load_image(file));
  }

  destroy() {
    this.destroyed = true;
    this.images.original?.bitmap.close();
    this.images.edited?.bitmap.close();
  }
}
