export const TRANSPARENT = 0;
export const MAX_COLORS = 256;
export const MAX_SIDE = 1024;
export const MAX_FRAMES = 1000;
export const MAX_LAYERS = 64;
export const DEFAULT_DURATION = 100;

export const Direction = { FORWARD: "forward", REVERSE: "reverse", PINGPONG: "pingpong" } as const;
export type Direction = (typeof Direction)[keyof typeof Direction];
export const DIRECTIONS = Object.values(Direction) as [Direction, ...Direction[]];

export interface Layer {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly locked: boolean;
  readonly opacity: number;
}

export interface Frame {
  readonly id: string;
  readonly duration: number;
}

export interface Tag {
  readonly name: string;
  readonly from: number;
  readonly to: number;
  readonly direction: Direction;
}

// Immutable with shared cels, so a history entry costs only the cels an edit replaced.
export interface Sprite {
  readonly width: number;
  readonly height: number;
  readonly palette: readonly string[];
  readonly layers: readonly Layer[];
  readonly frames: readonly Frame[];
  readonly cels: ReadonlyMap<string, Uint8Array>;
  readonly tags: readonly Tag[];
}

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function cel_key(layer_id: string, frame_id: string): string {
  return `${layer_id}/${frame_id}`;
}

export function new_id(): string {
  return crypto.randomUUID().slice(0, 8);
}

export function get_cel(sprite: Sprite, layer_id: string, frame_index: number): Uint8Array | undefined {
  const frame = sprite.frames[frame_index];
  return frame ? sprite.cels.get(cel_key(layer_id, frame.id)) : undefined;
}

export function layer_name(layers: readonly Layer[]): string {
  const taken = new Set(layers.map((layer) => layer.name));
  for (let n = layers.length + 1; ; n++) if (!taken.has(`Layer ${n}`)) return `Layer ${n}`;
}

export function create_sprite(width: number, height: number, palette: readonly string[]): Sprite {
  return {
    width,
    height,
    palette: [TRANSPARENT_HEX, ...palette.filter((color) => color !== TRANSPARENT_HEX)].slice(0, MAX_COLORS),
    layers: [{ id: new_id(), name: "Layer 1", visible: true, locked: false, opacity: 1 }],
    frames: [{ id: new_id(), duration: DEFAULT_DURATION }],
    cels: new Map(),
    tags: [],
  };
}

export const TRANSPARENT_HEX = "#00000000";

export function clamp_side(value: number): number {
  return Number.isFinite(value) ? Math.min(MAX_SIDE, Math.max(1, Math.round(value))) : 1;
}

export function total_duration(sprite: Sprite): number {
  return sprite.frames.reduce((sum, frame) => sum + frame.duration, 0);
}
