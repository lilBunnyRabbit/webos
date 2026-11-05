import { z } from "zod";

export const Tool = {
  PENCIL: "pencil",
  BRUSH: "brush",
  ERASER: "eraser",
  LINE: "line",
  RECTANGLE: "rectangle",
  ELLIPSE: "ellipse",
  FILL: "fill",
  PICKER: "picker",
  TEXT: "text",
  HAND: "hand",
} as const;
export type Tool = (typeof Tool)[keyof typeof Tool];

export const TOOLS = Object.values(Tool) as [Tool, ...Tool[]];

export const FillMode = { OUTLINE: "outline", FILL: "fill", BOTH: "both" } as const;
export type FillMode = (typeof FillMode)[keyof typeof FillMode];

export const FILL_MODES = Object.values(FillMode) as [FillMode, ...FillMode[]];

export const Background = { WHITE: "white", TRANSPARENT: "transparent" } as const;
export type Background = (typeof Background)[keyof typeof Background];

export const TOOL_KEYS: Record<Tool, string> = {
  pencil: "p",
  brush: "b",
  eraser: "e",
  line: "l",
  rectangle: "r",
  ellipse: "o",
  fill: "f",
  picker: "i",
  text: "t",
  hand: "h",
};

export const TOOL_LABELS: Record<Tool, string> = {
  pencil: "Pencil",
  brush: "Brush",
  eraser: "Eraser",
  line: "Line",
  rectangle: "Rectangle",
  ellipse: "Ellipse",
  fill: "Fill",
  picker: "Colour picker",
  text: "Text",
  hand: "Pan",
};

export function is_shape(tool: Tool): boolean {
  return tool === Tool.LINE || tool === Tool.RECTANGLE || tool === Tool.ELLIPSE;
}

export function is_freehand(tool: Tool): boolean {
  return tool === Tool.PENCIL || tool === Tool.BRUSH || tool === Tool.ERASER;
}

export function uses_size(tool: Tool): boolean {
  return is_freehand(tool) || is_shape(tool) || tool === Tool.TEXT;
}

export function text_font_size(size: number): number {
  return Math.max(8, size * 4);
}

const HEX = z.string().regex(/^#[0-9a-f]{6}$/i);

// Field names stay the old localStorage keys: the 4.0 boot copy writes them into storage.json as they were.
export const storage_schema = z.object({
  tool: z.enum(TOOLS).catch(Tool.BRUSH),
  size: z.number().int().min(1).max(100).catch(4),
  tolerance: z.number().min(0).max(100).catch(10),
  fill_mode: z.enum(FILL_MODES).catch(FillMode.OUTLINE),
  primary: HEX.catch("#000000"),
  secondary: HEX.catch("#ffffff"),
  recent: z.array(HEX).max(8).catch(() => []),
  saved_new: z.number().int().nonnegative().catch(0),
});
export type StorageFile = z.infer<typeof storage_schema>;

export function empty_storage(): StorageFile {
  return {
    tool: Tool.BRUSH,
    size: 4,
    tolerance: 10,
    fill_mode: FillMode.OUTLINE,
    primary: "#000000",
    secondary: "#ffffff",
    recent: [],
    saved_new: 0,
  };
}
