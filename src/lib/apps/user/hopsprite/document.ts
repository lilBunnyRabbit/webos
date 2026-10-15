import { nearest_index, normalize_hex, parse_hex } from "./color";
import {
  cel_key,
  DEFAULT_DURATION,
  MAX_COLORS,
  MAX_FRAMES,
  MAX_LAYERS,
  new_id,
  layer_name,
  TRANSPARENT_HEX,
  type Direction,
  type Layer,
  type Sprite,
  type Tag,
} from "./model";
import { flip_horizontal, flip_vertical, is_empty, remap, resize_canvas, rotate_ccw, rotate_cw, scale_nearest } from "./raster";

function with_cels(sprite: Sprite, edit: (cels: Map<string, Uint8Array>) => void): Map<string, Uint8Array> {
  const cels = new Map(sprite.cels);
  edit(cels);
  return cels;
}

export function set_cel(sprite: Sprite, layer_id: string, frame_id: string, data: Uint8Array | null): Sprite {
  const key = cel_key(layer_id, frame_id);
  const cels = with_cels(sprite, (map) => {
    if (!data || is_empty(data)) map.delete(key);
    else map.set(key, data);
  });
  return { ...sprite, cels };
}

export function add_layer(sprite: Sprite, above: number): { sprite: Sprite; layer: Layer } | null {
  if (sprite.layers.length >= MAX_LAYERS) return null;
  const layer: Layer = { id: new_id(), name: layer_name(sprite.layers), visible: true, locked: false, opacity: 1 };
  const layers = [...sprite.layers];
  layers.splice(above + 1, 0, layer);
  return { sprite: { ...sprite, layers }, layer };
}

export function duplicate_layer(sprite: Sprite, id: string): { sprite: Sprite; layer: Layer } | null {
  const index = sprite.layers.findIndex((layer) => layer.id === id);
  if (index < 0 || sprite.layers.length >= MAX_LAYERS) return null;
  const source = sprite.layers[index];
  const layer: Layer = { ...source, id: new_id(), name: `${source.name} copy` };
  const layers = [...sprite.layers];
  layers.splice(index + 1, 0, layer);
  const cels = with_cels(sprite, (map) => {
    for (const frame of sprite.frames) {
      const data = sprite.cels.get(cel_key(id, frame.id));
      if (data) map.set(cel_key(layer.id, frame.id), data);
    }
  });
  return { sprite: { ...sprite, layers, cels }, layer };
}

export function remove_layer(sprite: Sprite, id: string): Sprite {
  if (sprite.layers.length <= 1) return sprite;
  const cels = with_cels(sprite, (map) => {
    for (const frame of sprite.frames) map.delete(cel_key(id, frame.id));
  });
  return { ...sprite, layers: sprite.layers.filter((layer) => layer.id !== id), cels };
}

export function move_layer(sprite: Sprite, id: string, delta: number): Sprite {
  const index = sprite.layers.findIndex((layer) => layer.id === id);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= sprite.layers.length) return sprite;
  const layers = [...sprite.layers];
  const [layer] = layers.splice(index, 1);
  layers.splice(target, 0, layer);
  return { ...sprite, layers };
}

export function update_layer(sprite: Sprite, id: string, patch: Partial<Omit<Layer, "id">>): Sprite {
  return { ...sprite, layers: sprite.layers.map((layer) => (layer.id === id ? { ...layer, ...patch } : layer)) };
}

export function merge_down(sprite: Sprite, id: string): Sprite {
  const index = sprite.layers.findIndex((layer) => layer.id === id);
  if (index <= 0) return sprite;
  const below = sprite.layers[index - 1];
  const cels = with_cels(sprite, (map) => {
    for (const frame of sprite.frames) {
      const upper = sprite.cels.get(cel_key(id, frame.id));
      map.delete(cel_key(id, frame.id));
      if (!upper) continue;
      const lower = sprite.cels.get(cel_key(below.id, frame.id));
      const merged = lower ? new Uint8Array(lower) : new Uint8Array(upper.length);
      for (let i = 0; i < upper.length; i++) if (upper[i]) merged[i] = upper[i];
      map.set(cel_key(below.id, frame.id), merged);
    }
  });
  return { ...sprite, layers: sprite.layers.filter((layer) => layer.id !== id), cels };
}

function shift_tags(tags: readonly Tag[], at: number, delta: 1 | -1, frame_count: number): Tag[] {
  const result: Tag[] = [];
  for (const tag of tags) {
    if (delta === 1) {
      result.push({ ...tag, from: tag.from >= at ? tag.from + 1 : tag.from, to: tag.to >= at ? tag.to + 1 : tag.to });
      continue;
    }
    if (tag.from === at && tag.to === at) continue;
    const from = tag.from > at ? tag.from - 1 : tag.from;
    const to = tag.to >= at ? tag.to - 1 : tag.to;
    result.push({ ...tag, from: Math.min(from, frame_count - 1), to: Math.min(Math.max(from, to), frame_count - 1) });
  }
  return result;
}

// A copy shares the source cels; they are immutable, so the first edit splits them.
export function insert_frame(sprite: Sprite, after: number, copy: boolean): Sprite {
  if (sprite.frames.length >= MAX_FRAMES) return sprite;
  const source = sprite.frames[after];
  const frame = { id: new_id(), duration: source?.duration ?? DEFAULT_DURATION };
  const frames = [...sprite.frames];
  frames.splice(after + 1, 0, frame);
  const cels = copy && source
    ? with_cels(sprite, (map) => {
        for (const layer of sprite.layers) {
          const data = sprite.cels.get(cel_key(layer.id, source.id));
          if (data) map.set(cel_key(layer.id, frame.id), data);
        }
      })
    : sprite.cels;
  return { ...sprite, frames, cels, tags: shift_tags(sprite.tags, after + 1, 1, frames.length) };
}

export function remove_frame(sprite: Sprite, index: number): Sprite {
  if (sprite.frames.length <= 1 || !sprite.frames[index]) return sprite;
  const removed = sprite.frames[index];
  const frames = sprite.frames.filter((_, i) => i !== index);
  const cels = with_cels(sprite, (map) => {
    for (const layer of sprite.layers) map.delete(cel_key(layer.id, removed.id));
  });
  return { ...sprite, frames, cels, tags: shift_tags(sprite.tags, index, -1, frames.length) };
}

export function move_frame(sprite: Sprite, from: number, to: number): Sprite {
  if (from === to || !sprite.frames[from] || to < 0 || to >= sprite.frames.length) return sprite;
  const frames = [...sprite.frames];
  const [frame] = frames.splice(from, 1);
  frames.splice(to, 0, frame);
  return { ...sprite, frames };
}

export function set_durations(sprite: Sprite, indices: readonly number[], duration: number): Sprite {
  const value = Math.min(65535, Math.max(1, Math.round(duration)));
  const chosen = new Set(indices);
  return { ...sprite, frames: sprite.frames.map((frame, i) => (chosen.has(i) ? { ...frame, duration: value } : frame)) };
}

export function add_tag(sprite: Sprite, name: string, from: number, to: number, direction: Direction): Sprite {
  const last = sprite.frames.length - 1;
  const a = Math.max(0, Math.min(from, to, last));
  const b = Math.min(last, Math.max(from, to));
  return { ...sprite, tags: [...sprite.tags, { name, from: a, to: b, direction }] };
}

export function update_tag(sprite: Sprite, index: number, patch: Partial<Tag>): Sprite {
  return { ...sprite, tags: sprite.tags.map((tag, i) => (i === index ? { ...tag, ...patch } : tag)) };
}

export function remove_tag(sprite: Sprite, index: number): Sprite {
  return { ...sprite, tags: sprite.tags.filter((_, i) => i !== index) };
}

function map_all_cels(sprite: Sprite, map: (data: Uint8Array) => Uint8Array): Map<string, Uint8Array> {
  const cels = new Map<string, Uint8Array>();
  for (const [key, data] of sprite.cels) cels.set(key, map(data));
  return cels;
}

export function set_color(sprite: Sprite, index: number, hex: string): Sprite {
  if (index <= 0 || index >= sprite.palette.length) return sprite;
  const palette = [...sprite.palette];
  palette[index] = normalize_hex(hex);
  return { ...sprite, palette };
}

export function add_color(sprite: Sprite, hex: string): { sprite: Sprite; index: number } | null {
  if (sprite.palette.length >= MAX_COLORS) return null;
  return { sprite: { ...sprite, palette: [...sprite.palette, normalize_hex(hex)] }, index: sprite.palette.length };
}

export function remove_color(sprite: Sprite, index: number): Sprite {
  if (index <= 0 || index >= sprite.palette.length) return sprite;
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = i < index ? i : i === index ? 0 : i - 1;
  return {
    ...sprite,
    palette: sprite.palette.filter((_, i) => i !== index),
    cels: map_all_cels(sprite, (data) => remap(data, table)),
  };
}

export function replace_palette(sprite: Sprite, colors: readonly string[]): Sprite {
  const palette = [TRANSPARENT_HEX, ...colors.map(normalize_hex)].slice(0, MAX_COLORS);
  if (palette.length >= sprite.palette.length) return { ...sprite, palette };
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    table[i] = i < palette.length ? i : i < sprite.palette.length ? nearest_index(palette, parse_hex(sprite.palette[i])) : 0;
  }
  return { ...sprite, palette, cels: map_all_cels(sprite, (data) => remap(data, table)) };
}

export function used_colors(sprite: Sprite): Set<number> {
  const used = new Set<number>();
  for (const data of sprite.cels.values()) for (let i = 0; i < data.length; i++) used.add(data[i]);
  return used;
}

export function resize_sprite(sprite: Sprite, width: number, height: number, anchor_x: number, anchor_y: number): Sprite {
  const dx = Math.floor((width - sprite.width) * anchor_x);
  const dy = Math.floor((height - sprite.height) * anchor_y);
  const cels = new Map<string, Uint8Array>();
  for (const [key, data] of sprite.cels) {
    const next = resize_canvas(data, sprite.width, sprite.height, width, height, dx, dy);
    if (!is_empty(next)) cels.set(key, next);
  }
  return { ...sprite, width, height, cels };
}

export function scale_sprite(sprite: Sprite, width: number, height: number): Sprite {
  return { ...sprite, width, height, cels: map_all_cels(sprite, (data) => scale_nearest(data, sprite.width, sprite.height, width, height)) };
}

export const Transform = { FLIP_H: "flip-h", FLIP_V: "flip-v", ROTATE_CW: "rotate-cw", ROTATE_CCW: "rotate-ccw" } as const;
export type Transform = (typeof Transform)[keyof typeof Transform];

export function transform_buffer(transform: Transform, data: Uint8Array, width: number, height: number): Uint8Array {
  if (transform === Transform.FLIP_H) return flip_horizontal(data, width, height);
  if (transform === Transform.FLIP_V) return flip_vertical(data, width, height);
  if (transform === Transform.ROTATE_CW) return rotate_cw(data, width, height);
  return rotate_ccw(data, width, height);
}

export function turns(transform: Transform): boolean {
  return transform === Transform.ROTATE_CW || transform === Transform.ROTATE_CCW;
}

export function transform_sprite(sprite: Sprite, transform: Transform): Sprite {
  const cels = map_all_cels(sprite, (data) => transform_buffer(transform, data, sprite.width, sprite.height));
  return turns(transform) ? { ...sprite, width: sprite.height, height: sprite.width, cels } : { ...sprite, cels };
}

export function added_bytes(previous: Sprite | null, next: Sprite): number {
  const known = new Set(previous?.cels.values() ?? []);
  let bytes = 0;
  for (const data of next.cels.values()) if (!known.has(data)) bytes += data.byteLength;
  return bytes;
}
