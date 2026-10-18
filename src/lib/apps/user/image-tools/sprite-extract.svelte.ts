import type { SourceImage } from "$kit/utils/image";
import { Anchor } from "./sprite-export";
import {
  clamp_rect,
  compute_base_grid,
  compute_grid,
  content_bounds,
  DEFAULT_SETTINGS,
  default_sequence,
  detect_grid,
  detection_to_state,
  EMPTY_OVERRIDES,
  type LineAxis,
  type LineEdge,
  type PaddingSide,
  type Rect,
  type SequenceOrder,
  type SpriteOverrides,
  type SpriteSettings,
} from "./sprite-model";

/** One window's sheet: the image, the grid on it, manual fixes and the frame order. */
export class SpriteExtractState {
  source = $state.raw<SourceImage | null>(null);
  settings = $state.raw<SpriteSettings>(DEFAULT_SETTINGS);
  overrides = $state.raw<SpriteOverrides>(EMPTY_OVERRIDES);
  sequence = $state.raw<number[]>([]);
  selected = $state<number | null>(null);
  anchor = $state<Anchor>(Anchor.CENTER);
  fps = $state(12);
  uniform = $state(true);

  readonly width = $derived(this.source?.bitmap.width ?? 0);
  readonly height = $derived(this.source?.bitmap.height ?? 0);
  readonly grid = $derived(compute_grid(this.width, this.height, this.settings, this.overrides));

  /** Offscreen copy of the image for pixel reads. */
  readonly pixels = $derived.by(() => {
    if (!this.source) return null;
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx?.drawImage(this.source.bitmap, 0, 0);
    return ctx;
  });

  constructor(settings: SpriteSettings) {
    this.settings = settings;
  }

  set_source(source: SourceImage | null) {
    this.source = source;
    this.overrides = EMPTY_OVERRIDES;
    this.selected = null;
    if (!source) {
      this.sequence = [];
      return;
    }
    const base = compute_base_grid(source.bitmap.width, source.bitmap.height, this.settings);
    this.sequence = default_sequence(base.columns.length, base.rows.length);
  }

  /** A change that alters the number of columns or rows drops the manual fixes and the custom order. */
  patch_settings(patch: Partial<SpriteSettings>) {
    const next = { ...this.settings, ...patch };
    if (this.width && this.height) {
      const before = compute_base_grid(this.width, this.height, this.settings);
      const after = compute_base_grid(this.width, this.height, next);
      if (before.columns.length !== after.columns.length || before.rows.length !== after.rows.length) {
        this.overrides = EMPTY_OVERRIDES;
        this.sequence = default_sequence(after.columns.length, after.rows.length);
        this.selected = null;
      }
    }
    this.settings = next;
  }

  set_padding(side: PaddingSide, value: number) {
    this.patch_settings({ padding: { ...this.settings.padding, [side]: Math.max(0, Math.round(value)) } });
  }

  set_spacing(axis: "x" | "y", value: number) {
    this.patch_settings({ spacing: { ...this.settings.spacing, [axis]: Math.max(0, Math.round(value)) } });
  }

  /** Sets one grid line in image coordinates, or clears its override with `undefined`. */
  set_line(axis: LineAxis, index: number, edge: LineEdge, value: number | undefined) {
    const key = axis === "column" ? "columns" : "rows";
    const current = { ...this.overrides[key][index] };
    if (value === undefined) delete current[edge];
    else current[edge] = Math.round(value);

    const next = { ...this.overrides[key] };
    if (Object.keys(current).length) next[index] = current;
    else delete next[index];

    this.overrides = { ...this.overrides, [key]: next };
  }

  set_frame_rect(index: number, rect: Rect) {
    this.overrides = {
      ...this.overrides,
      frames: { ...this.overrides.frames, [index]: clamp_rect(rect, this.width, this.height) },
    };
  }

  reset_frame(index: number) {
    if (!(index in this.overrides.frames)) return;
    const frames = { ...this.overrides.frames };
    delete frames[index];
    this.overrides = { ...this.overrides, frames };
  }

  reset_lines() {
    this.overrides = { ...this.overrides, columns: {}, rows: {} };
  }

  reset_overrides() {
    this.overrides = EMPTY_OVERRIDES;
  }

  fit_frame_to_content(index: number) {
    const frame = this.grid.frames[index];
    if (!this.pixels || !frame) return;
    const bounds = content_bounds(this.pixels, frame);
    if (bounds) this.set_frame_rect(index, bounds);
  }

  fit_all_to_content() {
    const pixels = this.pixels;
    if (!pixels) return;
    const frames = { ...this.overrides.frames };
    this.grid.frames.forEach((frame, index) => {
      const bounds = content_bounds(pixels, frame);
      if (bounds) frames[index] = bounds;
    });
    this.overrides = { ...this.overrides, frames };
  }

  /** `false` when the sheet has no clear gaps to detect. */
  auto_detect(): boolean {
    if (!this.pixels) return false;
    const detected = detect_grid(this.pixels);
    if (!detected) return false;
    const next = detection_to_state(this.width, this.height, detected, this.settings);
    this.settings = next.settings;
    this.overrides = next.overrides;
    this.sequence = default_sequence(detected.columns.length, detected.rows.length);
    this.selected = null;
    return true;
  }

  reset_sequence(order: SequenceOrder = "row") {
    this.sequence = default_sequence(this.grid.columns.length, this.grid.rows.length, order);
  }

  reverse_sequence() {
    this.sequence = [...this.sequence].reverse();
  }

  /** Removes every occurrence of `index`, or appends it when absent. */
  toggle_in_sequence(index: number) {
    this.sequence = this.sequence.includes(index)
      ? this.sequence.filter((i) => i !== index)
      : [...this.sequence, index];
  }

  remove_sequence_at(position: number) {
    this.sequence = this.sequence.filter((_, i) => i !== position);
  }

  move_sequence_item(from: number, to: number) {
    if (from === to || from < 0 || from >= this.sequence.length) return;
    const next = [...this.sequence];
    const [item] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(to, next.length)), 0, item);
    this.sequence = next;
  }

  /** Moves the selected frame by `dx`/`dy`, or resizes it with `resize`. */
  nudge_selected(dx: number, dy: number, resize: boolean) {
    const index = this.selected;
    const frame = index === null ? null : this.grid.frames[index];
    if (index === null || !frame) return;
    this.set_frame_rect(
      index,
      resize
        ? { ...frame, w: Math.max(1, frame.w + dx), h: Math.max(1, frame.h + dy) }
        : { ...frame, x: frame.x + dx, y: frame.y + dy }
    );
  }
}
