import { can_redo, can_undo, create_history, current, push, redo, undo, type History } from "$lib/core/utils/history";
import { pick_index } from "./composite";
import * as doc from "./document";
import { cel_key, create_sprite, type Layer, type Point, type Sprite } from "./model";
import {
  brush_offsets,
  ellipse_points,
  extract,
  line_points,
  mask_bounds,
  match_mask,
  mirror_points,
  normalize_rect,
  Pattern,
  pattern_hit,
  pixel_perfect,
  rect_mask,
  rect_points,
  snap_line,
  stamp,
} from "./raster";
import { combine_masks, is_freehand, is_shape, SelectMode, Tool, type ToolSettings } from "./tools";

interface Entry {
  sprite: Sprite;
  bytes: number;
}

const LIMITS = { max_entries: 200, max_bytes: 128 * 1024 * 1024, size_of: (entry: Entry) => entry.bytes };

interface Draft {
  key: string;
  data: Uint8Array;
}

export interface Floating {
  layer_id: string;
  frame_id: string;
  base: Uint8Array;
  data: Uint8Array;
  mask: Uint8Array;
  width: number;
  height: number;
  x: number;
  y: number;
  origin: Point;
}

interface Clip {
  data: Uint8Array;
  width: number;
  height: number;
  x: number;
  y: number;
}

interface Stroke {
  tool: Tool;
  settings: ToolSettings;
  index: number;
  start: Point;
  last: Point;
  path: Point[];
  base: Uint8Array;
  key: string;
  layer_id: string;
  frame_id: string;
  constrain: boolean;
  mode: SelectMode;
  selection_base: Uint8Array | null;
  float_start: Point | null;
}

export interface Modifiers {
  shift: boolean;
  alt: boolean;
}

export class Editor {
  history = $state.raw<History<Entry>>(create_history({ sprite: create_sprite(1, 1, []), bytes: 0 }));
  saved = $state.raw<Sprite | null>(null);
  layer_id = $state("");
  frame = $state(0);
  primary = $state(1);
  secondary = $state(0);
  draft = $state.raw<Draft | null>(null);
  selection = $state.raw<Uint8Array | null>(null);
  floating = $state.raw<Floating | null>(null);
  palette_preview = $state.raw<readonly string[] | null>(null);
  notice = $state<string | null>(null);
  generation = $state(0);

  private stroke: Stroke | null = null;
  private clip: Clip | null = null;

  readonly sprite = $derived(current(this.history).sprite);
  readonly dirty = $derived(this.sprite !== this.saved);
  readonly undoable = $derived(can_undo(this.history) || this.floating !== null);
  readonly redoable = $derived(can_redo(this.history));
  readonly layer = $derived<Layer>(this.sprite.layers.find((layer) => layer.id === this.layer_id) ?? this.sprite.layers[this.sprite.layers.length - 1]);
  readonly display = $derived<Sprite>(this.palette_preview ? { ...this.sprite, palette: this.palette_preview } : this.sprite);

  readonly overrides = $derived.by(() => {
    const map = new Map<string, Uint8Array>();
    const float = this.floating;
    if (float) map.set(cel_key(float.layer_id, float.frame_id), this.placed(float));
    if (this.draft) map.set(this.draft.key, this.draft.data);
    return map;
  });

  readonly outline = $derived.by(() => {
    const float = this.floating;
    if (!float) return this.selection;
    const { width, height } = this.sprite;
    const mask = new Uint8Array(width * height);
    stamp(mask, width, height, float.mask, float.width, float.height, float.x, float.y);
    return mask;
  });

  constructor(sprite: Sprite) {
    this.load(sprite, true);
  }

  load(sprite: Sprite, saved: boolean): void {
    this.generation++;
    this.stroke = null;
    this.draft = null;
    this.floating = null;
    this.selection = null;
    this.palette_preview = null;
    this.history = create_history({ sprite, bytes: 0 });
    this.saved = saved ? sprite : null;
    this.frame = 0;
    this.layer_id = sprite.layers[sprite.layers.length - 1].id;
    this.primary = Math.min(this.primary, sprite.palette.length - 1) || (sprite.palette.length > 1 ? 1 : 0);
    this.secondary = Math.min(this.secondary, sprite.palette.length - 1);
  }

  mark_saved(sprite: Sprite): void {
    this.saved = sprite;
  }

  commit(next: Sprite): void {
    const previous = this.sprite;
    if (next === previous) return;
    this.history = push(this.history, { sprite: next, bytes: doc.added_bytes(previous, next) }, LIMITS);
    this.settle();
  }

  // Floating pixels are dropped first so the edit sees the sprite the user sees.
  apply(edit: (sprite: Sprite) => Sprite): void {
    this.drop();
    this.commit(edit(this.sprite));
  }

  private settle(): void {
    const sprite = this.sprite;
    this.frame = Math.min(this.frame, sprite.frames.length - 1);
    if (!sprite.layers.some((layer) => layer.id === this.layer_id)) this.layer_id = sprite.layers[sprite.layers.length - 1].id;
    if (this.selection && this.selection.length !== sprite.width * sprite.height) this.selection = null;
    if (this.primary >= sprite.palette.length) this.primary = sprite.palette.length - 1;
    if (this.secondary >= sprite.palette.length) this.secondary = sprite.palette.length - 1;
  }

  undo(): void {
    if (this.stroke) return;
    if (this.floating) return this.cancel_float();
    if (!can_undo(this.history)) return;
    this.history = undo(this.history);
    this.settle();
  }

  redo(): void {
    if (this.stroke || !can_redo(this.history)) return;
    this.drop();
    this.history = redo(this.history);
    this.settle();
  }

  set_frame(index: number): void {
    const next = Math.max(0, Math.min(index, this.sprite.frames.length - 1));
    if (next === this.frame) return;
    this.drop();
    this.frame = next;
  }

  set_layer(id: string): void {
    if (id === this.layer_id) return;
    this.drop();
    this.layer_id = id;
  }

  cel(layer_id = this.layer.id, frame = this.frame): Uint8Array {
    const frame_id = this.sprite.frames[frame]?.id;
    const data = frame_id ? this.sprite.cels.get(cel_key(layer_id, frame_id)) : undefined;
    return data ? data.slice() : new Uint8Array(this.sprite.width * this.sprite.height);
  }

  private blocked(): string | null {
    if (this.layer.locked) return `${this.layer.name} is locked`;
    if (!this.layer.visible) return `${this.layer.name} is hidden`;
    return null;
  }

  private placed(float: Floating): Uint8Array {
    const data = float.base.slice();
    stamp(data, this.sprite.width, this.sprite.height, float.data, float.width, float.height, float.x, float.y);
    return data;
  }

  begin(point: Point, button: number, settings: ToolSettings, modifiers: Modifiers): void {
    if (this.stroke) return;
    this.notice = null;
    const tool = settings.tool;
    const index = button === 2 ? this.secondary : this.primary;

    if (tool === Tool.EYEDROPPER) return this.pick(point, button === 2);
    if (tool === Tool.HAND) return;

    if (tool === Tool.SELECT || tool === Tool.WAND) {
      this.drop();
      const mode = modifiers.shift ? SelectMode.ADD : modifiers.alt ? SelectMode.SUBTRACT : SelectMode.REPLACE;
      if (tool === Tool.WAND) {
        const mask = match_mask(this.cel(), this.sprite.width, this.sprite.height, point.x, point.y, settings.contiguous);
        if (mask) this.selection = this.non_empty(combine_masks(this.selection, mask, mode));
        return;
      }
      this.stroke = this.make_stroke(tool, settings, index, point, modifiers, mode);
      return;
    }

    const reason = this.blocked();
    if (reason) {
      this.notice = reason;
      return;
    }

    if (tool === Tool.MOVE) {
      if (!this.floating && !this.lift()) return;
      this.stroke = this.make_stroke(tool, settings, index, point, modifiers, SelectMode.REPLACE);
      this.stroke.float_start = { x: this.floating!.x, y: this.floating!.y };
      return;
    }

    this.drop();
    if (tool === Tool.FILL) return this.fill(point, index, settings);
    this.stroke = this.make_stroke(tool, settings, index, point, modifiers, SelectMode.REPLACE);
    this.render(this.stroke);
  }

  move(points: readonly Point[], modifiers: Modifiers): void {
    const stroke = this.stroke;
    if (!stroke || !points.length) return;
    stroke.constrain = modifiers.shift;
    for (const point of points) {
      if (point.x === stroke.last.x && point.y === stroke.last.y) continue;
      if (is_freehand(stroke.tool)) stroke.path.push(...line_points(stroke.last, point).slice(1));
      stroke.last = point;
    }

    if (stroke.tool === Tool.SELECT) {
      const rect = normalize_rect(stroke.start, stroke.last, stroke.constrain);
      const mask = rect_mask(rect, this.sprite.width, this.sprite.height);
      this.selection = combine_masks(stroke.selection_base, mask, stroke.mode);
      return;
    }
    if (stroke.tool === Tool.MOVE) {
      const float = this.floating;
      if (!float || !stroke.float_start) return;
      this.floating = {
        ...float,
        x: stroke.float_start.x + stroke.last.x - stroke.start.x,
        y: stroke.float_start.y + stroke.last.y - stroke.start.y,
      };
      return;
    }
    this.render(stroke);
  }

  end(): void {
    const stroke = this.stroke;
    this.stroke = null;
    if (!stroke) return;
    if (stroke.tool === Tool.SELECT) {
      const clicked = stroke.start.x === stroke.last.x && stroke.start.y === stroke.last.y;
      if (clicked && stroke.mode === SelectMode.REPLACE) this.selection = null;
      else if (this.selection) this.selection = this.non_empty(this.selection);
      return;
    }
    if (stroke.tool === Tool.MOVE) return;
    const draft = this.draft;
    this.draft = null;
    if (!draft || equal(draft.data, stroke.base)) return;
    this.commit(doc.set_cel(this.sprite, stroke.layer_id, stroke.frame_id, draft.data));
  }

  cancel(): void {
    const stroke = this.stroke;
    this.stroke = null;
    this.draft = null;
    if (stroke?.tool === Tool.SELECT) this.selection = stroke.selection_base;
    if (stroke?.tool === Tool.MOVE && this.floating && stroke.float_start) {
      this.floating = { ...this.floating, x: stroke.float_start.x, y: stroke.float_start.y };
    }
  }

  get stroking(): boolean {
    return this.stroke !== null;
  }

  private make_stroke(tool: Tool, settings: ToolSettings, index: number, point: Point, modifiers: Modifiers, mode: SelectMode): Stroke {
    const frame_id = this.sprite.frames[this.frame].id;
    return {
      tool,
      settings: { ...settings },
      index,
      start: point,
      last: point,
      path: [point],
      base: this.cel(),
      key: cel_key(this.layer.id, frame_id),
      layer_id: this.layer.id,
      frame_id,
      constrain: modifiers.shift,
      mode,
      selection_base: this.selection,
      float_start: null,
    };
  }

  private stroke_points(stroke: Stroke): { points: Point[]; brush: boolean } {
    const { settings, start, last, constrain } = stroke;
    if (is_freehand(stroke.tool)) {
      return { points: settings.pixel_perfect && settings.size === 1 ? pixel_perfect(stroke.path) : stroke.path, brush: true };
    }
    if (stroke.tool === Tool.LINE) return { points: line_points(start, constrain ? snap_line(start, last) : last), brush: true };
    const rect = normalize_rect(start, last, constrain);
    const points = stroke.tool === Tool.RECTANGLE ? rect_points(rect, settings.filled) : ellipse_points(rect, settings.filled);
    return { points, brush: !settings.filled };
  }

  private render(stroke: Stroke): void {
    const { width, height } = this.sprite;
    const { settings } = stroke;
    const data = stroke.base.slice();
    const erase = stroke.tool === Tool.ERASER;
    const index = erase ? 0 : stroke.index;
    const pattern = erase ? Pattern.SOLID : settings.pattern;
    const { points, brush } = this.stroke_points(stroke);
    const offsets = brush ? brush_offsets(settings.size, settings.shape) : [{ x: 0, y: 0 }];
    const selection = this.selection;

    for (const point of points) {
      for (const offset of offsets) {
        const target = { x: point.x + offset.x, y: point.y + offset.y };
        for (const { x, y } of mirror_points(target, width, height, settings.mirror_x, settings.mirror_y)) {
          if (x < 0 || y < 0 || x >= width || y >= height) continue;
          const i = y * width + x;
          if (selection && !selection[i]) continue;
          if (!pattern_hit(pattern, x, y)) continue;
          data[i] = index;
        }
      }
    }
    this.draft = { key: stroke.key, data };
  }

  private fill(point: Point, index: number, settings: ToolSettings): void {
    const { width, height } = this.sprite;
    const base = this.cel();
    const mask = match_mask(base, width, height, point.x, point.y, settings.contiguous);
    if (!mask) return;
    const data = base.slice();
    const selection = this.selection;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || (selection && !selection[i])) continue;
      if (pattern_hit(settings.pattern, i % width, Math.floor(i / width))) data[i] = index;
    }
    if (equal(data, base)) return;
    this.commit(doc.set_cel(this.sprite, this.layer.id, this.sprite.frames[this.frame].id, data));
  }

  pick(point: Point, secondary: boolean): void {
    const index = pick_index(this.sprite, this.frame, point.x, point.y);
    if (secondary) this.secondary = index;
    else this.primary = index;
  }

  private non_empty(mask: Uint8Array): Uint8Array | null {
    return mask.some((value) => value) ? mask : null;
  }

  lift(): boolean {
    if (this.floating) return true;
    if (this.blocked()) return false;
    const { width, height } = this.sprite;
    const cel = this.cel();
    const selection = this.selection ?? rect_mask({ x: 0, y: 0, width, height }, width, height);
    const bounds = this.selection ? mask_bounds(selection, width, height) : mask_bounds(cel, width, height);
    if (!bounds) return false;
    const data = extract(cel, width, bounds, selection);
    const mask = extract(selection, width, bounds);
    const base = cel.slice();
    for (let i = 0; i < base.length; i++) if (selection[i]) base[i] = 0;
    this.floating = {
      layer_id: this.layer.id,
      frame_id: this.sprite.frames[this.frame].id,
      base,
      data,
      mask,
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      origin: { x: bounds.x, y: bounds.y },
    };
    this.selection = null;
    return true;
  }

  drop(): void {
    const float = this.floating;
    if (!float) return;
    this.floating = null;
    const { width, height } = this.sprite;
    const mask = new Uint8Array(width * height);
    stamp(mask, width, height, float.mask, float.width, float.height, float.x, float.y);
    this.commit(doc.set_cel(this.sprite, float.layer_id, float.frame_id, this.placed(float)));
    this.selection = this.non_empty(mask);
  }

  cancel_float(): void {
    const float = this.floating;
    if (!float) return;
    this.floating = null;
    const { width, height } = this.sprite;
    const mask = new Uint8Array(width * height);
    stamp(mask, width, height, float.mask, float.width, float.height, float.origin.x, float.origin.y);
    this.selection = this.non_empty(mask);
  }

  transform_selection(transform: doc.Transform): void {
    if (!this.floating && !this.lift()) return;
    const float = this.floating!;
    const data = doc.transform_buffer(transform, float.data, float.width, float.height);
    const mask = doc.transform_buffer(transform, float.mask, float.width, float.height);
    if (!doc.turns(transform)) return void (this.floating = { ...float, data, mask });
    const cx = float.x + float.width / 2;
    const cy = float.y + float.height / 2;
    this.floating = {
      ...float,
      data,
      mask,
      width: float.height,
      height: float.width,
      x: Math.round(cx - float.height / 2),
      y: Math.round(cy - float.width / 2),
    };
  }

  nudge(dx: number, dy: number): void {
    if (!this.floating && !this.lift()) return;
    const float = this.floating!;
    this.floating = { ...float, x: float.x + dx, y: float.y + dy };
  }

  select_all(): void {
    this.drop();
    const { width, height } = this.sprite;
    this.selection = rect_mask({ x: 0, y: 0, width, height }, width, height);
  }

  deselect(): void {
    this.drop();
    this.selection = null;
  }

  invert_selection(): void {
    this.drop();
    const { width, height } = this.sprite;
    const mask = new Uint8Array(width * height);
    for (let i = 0; i < mask.length; i++) mask[i] = this.selection?.[i] ? 0 : 1;
    this.selection = this.non_empty(mask);
  }

  copy(): boolean {
    const float = this.floating;
    if (float) {
      this.clip = { data: float.data.slice(), width: float.width, height: float.height, x: float.x, y: float.y };
      return true;
    }
    const { width, height } = this.sprite;
    const cel = this.cel();
    const bounds = this.selection ? mask_bounds(this.selection, width, height) : mask_bounds(cel, width, height);
    if (!bounds) return false;
    this.clip = { data: extract(cel, width, bounds, this.selection ?? undefined), ...bounds };
    return true;
  }

  delete_selection(): boolean {
    const float = this.floating;
    if (float) {
      this.floating = null;
      this.commit(doc.set_cel(this.sprite, float.layer_id, float.frame_id, float.base));
      return true;
    }
    const selection = this.selection;
    if (!selection || this.blocked()) return false;
    const data = this.cel();
    for (let i = 0; i < data.length; i++) if (selection[i]) data[i] = 0;
    this.commit(doc.set_cel(this.sprite, this.layer.id, this.sprite.frames[this.frame].id, data));
    return true;
  }

  cut(): boolean {
    return this.copy() && this.delete_selection();
  }

  paste(): boolean {
    const clip = this.clip;
    if (!clip) return false;
    const reason = this.blocked();
    if (reason) {
      this.notice = reason;
      return false;
    }
    this.drop();
    const { width, height } = this.sprite;
    const x = Math.max(0, Math.min(clip.x, width - clip.width));
    const y = Math.max(0, Math.min(clip.y, height - clip.height));
    this.floating = {
      layer_id: this.layer.id,
      frame_id: this.sprite.frames[this.frame].id,
      base: this.cel(),
      data: clip.data.slice(),
      mask: new Uint8Array(clip.width * clip.height).fill(1),
      width: clip.width,
      height: clip.height,
      x,
      y,
      origin: { x, y },
    };
    this.selection = null;
    return true;
  }

  get has_clip(): boolean {
    return this.clip !== null;
  }
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
