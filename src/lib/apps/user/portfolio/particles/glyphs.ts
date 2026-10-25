import { ShapeKind, type Shape } from "./shapes";

export const PRINCIPLE_GLYPHS: Record<string, ShapeKind> = {
  decisions: ShapeKind.DOCUMENT,
  team: ShapeKind.LAYERS,
  lightest: ShapeKind.FEATHER,
  tested: ShapeKind.CHECK,
  performance: ShapeKind.BOLT,
  feel: ShapeKind.WAVE,
};

export function shape_for(principle: string | null): Shape {
  return { kind: (principle && PRINCIPLE_GLYPHS[principle]) || ShapeKind.LOGO };
}
