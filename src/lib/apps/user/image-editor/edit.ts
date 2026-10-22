import { format_of, type ImageFormat } from "$kit/utils/image-format";
import { filter_css, FilterKind, type FilterStep } from "$kit/utils/filter/math";
import { file_stem } from "$lib/core/api/services/files/path";
import { clamp } from "$lib/core/utils";

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const OperationType = { CROP: "crop", RESIZE: "resize", ROTATE: "rotate", FLIP: "flip" } as const;
export type OperationType = (typeof OperationType)[keyof typeof OperationType];

export type Operation =
  | ({ type: typeof OperationType.CROP } & Rect)
  | ({ type: typeof OperationType.RESIZE } & Size)
  | { type: typeof OperationType.ROTATE; degrees: number }
  | { type: typeof OperationType.FLIP; horizontal: boolean };

export interface Adjustments {
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number;
  blur: number;
  grayscale: number;
  sepia: number;
}

export const DEFAULT_ADJUSTMENTS: Readonly<Adjustments> = Object.freeze({
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hue: 0,
  blur: 0,
  grayscale: 0,
  sepia: 0,
});

export interface EditDoc {
  readonly operations: readonly Operation[];
  readonly adjustments: Readonly<Adjustments>;
}

export const EMPTY_DOC: EditDoc = { operations: [], adjustments: DEFAULT_ADJUSTMENTS };

export const MAX_SIDE = 16384;

export function normalize_degrees(degrees: number): number {
  const result = (((degrees % 360) + 540) % 360) - 180;
  return result === -180 ? 180 : result;
}

function is_quarter_turn(degrees: number): boolean {
  return Math.abs(normalize_degrees(degrees)) % 90 === 0;
}

export function rotated_size({ width, height }: Size, degrees: number): Size {
  const turn = normalize_degrees(degrees);
  if (is_quarter_turn(turn)) return Math.abs(turn) === 90 ? { width: height, height: width } : { width, height };
  const radians = (turn * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  return { width: Math.ceil(width * cos + height * sin - 1e-9), height: Math.ceil(width * sin + height * cos - 1e-9) };
}

export function operation_size(size: Size, operation: Operation): Size {
  switch (operation.type) {
    case OperationType.CROP:
    case OperationType.RESIZE:
      return { width: operation.width, height: operation.height };
    case OperationType.ROTATE:
      return rotated_size(size, operation.degrees);
    case OperationType.FLIP:
      return size;
  }
}

export function result_size(source: Size, operations: readonly Operation[]): Size {
  return operations.reduce(operation_size, source);
}

export function round_rect(rect: Rect, bounds: Size): Rect {
  const x = clamp(Math.round(rect.x), 0, bounds.width - 1);
  const y = clamp(Math.round(rect.y), 0, bounds.height - 1);
  const right = clamp(Math.round(rect.x + rect.width), x + 1, bounds.width);
  const bottom = clamp(Math.round(rect.y + rect.height), y + 1, bounds.height);
  return { x, y, width: right - x, height: bottom - y };
}

/**
 * Appends an operation, folding it into the one before when they combine exactly (two turns, two flips of one axis),
 * so ten clicks on Rotate don't leave ten re-renders in the stack.
 */
export function add_operation(operations: readonly Operation[], operation: Operation): Operation[] {
  const last = operations.at(-1);
  const rest = operations.slice(0, -1);
  if (last?.type === OperationType.ROTATE && operation.type === OperationType.ROTATE) {
    if (is_quarter_turn(last.degrees) && is_quarter_turn(operation.degrees)) {
      const degrees = normalize_degrees(last.degrees + operation.degrees);
      return degrees === 0 ? rest : [...rest, { type: OperationType.ROTATE, degrees }];
    }
  }
  if (
    last?.type === OperationType.FLIP &&
    operation.type === OperationType.FLIP &&
    last.horizontal === operation.horizontal
  ) {
    return rest;
  }
  if (operation.type === OperationType.ROTATE && normalize_degrees(operation.degrees) === 0) return [...operations];
  return [...operations, operation];
}

export function adjustments_equal(a: Readonly<Adjustments>, b: Readonly<Adjustments>): boolean {
  return (Object.keys(DEFAULT_ADJUSTMENTS) as (keyof Adjustments)[]).every((key) => a[key] === b[key]);
}

/**
 * A CSS / canvas `filter` for the adjustments. `scale` is screen pixels per image pixel, so a preview at 200% blurs
 * twice as many screen pixels as the export blurs image pixels.
 */
export function adjustment_steps(adjustments: Readonly<Adjustments>, scale = 1): FilterStep[] {
  const steps: FilterStep[] = [];
  const { brightness, contrast, saturation, hue, blur, grayscale, sepia } = adjustments;
  if (brightness !== 100) steps.push({ kind: FilterKind.BRIGHTNESS, percent: brightness });
  if (contrast !== 100) steps.push({ kind: FilterKind.CONTRAST, percent: contrast });
  if (saturation !== 100) steps.push({ kind: FilterKind.SATURATE, percent: saturation });
  if (hue !== 0) steps.push({ kind: FilterKind.HUE_ROTATE, degrees: hue });
  if (grayscale !== 0) steps.push({ kind: FilterKind.GRAYSCALE, percent: grayscale });
  if (sepia !== 0) steps.push({ kind: FilterKind.SEPIA, percent: sepia });
  if (blur !== 0) steps.push({ kind: FilterKind.BLUR, radius: +(blur * scale).toFixed(3) });
  return steps;
}

export function filter_string(adjustments: Readonly<Adjustments>, scale = 1): string {
  return filter_css(adjustment_steps(adjustments, scale));
}

export function resize_to(current: Size, changed: "width" | "height", value: number, keep: boolean): Size {
  const side = clamp(Math.round(value) || 1, 1, MAX_SIDE);
  if (!keep)
    return changed === "width" ? { width: side, height: current.height } : { width: current.width, height: side };
  const ratio = current.width / current.height;
  return changed === "width"
    ? { width: side, height: clamp(Math.round(side / ratio) || 1, 1, MAX_SIDE) }
    : { width: clamp(Math.round(side * ratio) || 1, 1, MAX_SIDE), height: side };
}

export function name_for_format(name: string, format: ImageFormat, extension: string): string {
  if (format_of(name) === format) return name;
  return `${file_stem(name)}${extension}`;
}

export function resize_size(current: Size, width: number, height?: number): Size {
  if (height === undefined) return resize_to(current, "width", width, true);
  return { width: clamp(Math.round(width) || 1, 1, MAX_SIDE), height: clamp(Math.round(height) || 1, 1, MAX_SIDE) };
}

export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 16;
const ZOOM_LEVELS = [0.05, 0.1, 0.125, 0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16];

export function clamp_zoom(zoom: number): number {
  return clamp(zoom, ZOOM_MIN, ZOOM_MAX);
}

export function step_zoom(zoom: number, direction: 1 | -1): number {
  if (direction > 0) return ZOOM_LEVELS.find((level) => level > zoom + 1e-6) ?? ZOOM_MAX;
  return [...ZOOM_LEVELS].reverse().find((level) => level < zoom - 1e-6) ?? ZOOM_MIN;
}

export function fit_zoom(image: Size, view: Size): number {
  if (image.width <= 0 || image.height <= 0 || view.width <= 0 || view.height <= 0) return 1;
  return clamp_zoom(Math.min(1, view.width / image.width, view.height / image.height));
}
