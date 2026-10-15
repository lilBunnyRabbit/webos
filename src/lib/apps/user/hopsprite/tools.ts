import type { BrushShape, Pattern } from "./raster";

export const Tool = {
  PENCIL: "pencil",
  ERASER: "eraser",
  FILL: "fill",
  EYEDROPPER: "eyedropper",
  LINE: "line",
  RECTANGLE: "rectangle",
  ELLIPSE: "ellipse",
  SELECT: "select",
  WAND: "wand",
  MOVE: "move",
  HAND: "hand",
} as const;
export type Tool = (typeof Tool)[keyof typeof Tool];
export const TOOLS = Object.values(Tool) as [Tool, ...Tool[]];

export const TOOL_KEYS: Record<Tool, string> = {
  pencil: "b",
  eraser: "e",
  fill: "g",
  eyedropper: "i",
  line: "l",
  rectangle: "u",
  ellipse: "o",
  select: "m",
  wand: "w",
  move: "v",
  hand: "h",
};

export const TOOL_LABELS: Record<Tool, string> = {
  pencil: "Pencil",
  eraser: "Eraser",
  fill: "Fill",
  eyedropper: "Eyedropper",
  line: "Line",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  select: "Select",
  wand: "Magic wand",
  move: "Move",
  hand: "Pan",
};

export const TOOL_GROUPS: Tool[][] = [
  [Tool.PENCIL, Tool.ERASER, Tool.FILL, Tool.EYEDROPPER],
  [Tool.LINE, Tool.RECTANGLE, Tool.ELLIPSE],
  [Tool.SELECT, Tool.WAND, Tool.MOVE, Tool.HAND],
];

export interface ToolSettings {
  tool: Tool;
  size: number;
  shape: BrushShape;
  pixel_perfect: boolean;
  pattern: Pattern;
  contiguous: boolean;
  filled: boolean;
  mirror_x: boolean;
  mirror_y: boolean;
}

export function is_freehand(tool: Tool): boolean {
  return tool === Tool.PENCIL || tool === Tool.ERASER;
}

export function is_shape(tool: Tool): boolean {
  return tool === Tool.LINE || tool === Tool.RECTANGLE || tool === Tool.ELLIPSE;
}

export function paints(tool: Tool): boolean {
  return is_freehand(tool) || is_shape(tool) || tool === Tool.FILL;
}

export function uses_brush(tool: Tool): boolean {
  return is_freehand(tool) || is_shape(tool);
}

export const SelectMode = { REPLACE: "replace", ADD: "add", SUBTRACT: "subtract" } as const;
export type SelectMode = (typeof SelectMode)[keyof typeof SelectMode];

export function select_mode(event: { shiftKey: boolean; altKey: boolean }): SelectMode {
  return event.shiftKey ? SelectMode.ADD : event.altKey ? SelectMode.SUBTRACT : SelectMode.REPLACE;
}

export function combine_masks(base: Uint8Array | null, mask: Uint8Array, mode: SelectMode): Uint8Array {
  if (mode === SelectMode.REPLACE || !base) return mode === SelectMode.SUBTRACT ? new Uint8Array(mask.length) : mask;
  const out = new Uint8Array(mask.length);
  for (let i = 0; i < mask.length; i++) out[i] = mode === SelectMode.ADD ? base[i] | mask[i] : base[i] & (mask[i] ^ 1);
  return out;
}
