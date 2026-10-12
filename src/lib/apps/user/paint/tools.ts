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
