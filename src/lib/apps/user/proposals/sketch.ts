export const SKETCH_LONG = 1200;
export const SKETCH_SHORT = 900;

export function sketch_size(portrait: boolean): { width: number; height: number } {
  return portrait ? { width: SKETCH_SHORT, height: SKETCH_LONG } : { width: SKETCH_LONG, height: SKETCH_SHORT };
}

export type SketchTool = "pen" | "eraser";

export interface SketchStroke {
  tool: SketchTool;
  points: [number, number][];
}

export function stroke_width(tool: SketchTool): number {
  return tool === "pen" ? 6 : 40;
}
