import { fill, outlined, path, union, type Palette } from "../../../core/draw";
import { bounds_of, type Polygon, type Vec } from "../../../core/geometry";
import { GroundKind, HazardKind, layout_of, type Course, type Piece } from "./courses";

const RAISED: ReadonlySet<GroundKind> = new Set([GroundKind.PLANK, GroundKind.RAMP, GroundKind.DECK, GroundKind.BRIDGE, GroundKind.QUAY]);
const LIFT = { x: 0.22, y: 0.32 };

function shifted(shape: Polygon, by: Vec): Polygon {
  return shape.map((p) => ({ x: p.x + by.x, y: p.y + by.y }));
}

function axis(shape: Polygon): { from: Vec; along: Vec; across: Vec; length: number; width: number } {
  const a = { x: (shape[0].x + shape[3].x) / 2, y: (shape[0].y + shape[3].y) / 2 };
  const b = { x: (shape[1].x + shape[2].x) / 2, y: (shape[1].y + shape[2].y) / 2 };
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const along = { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
  const width = Math.hypot(shape[0].x - shape[3].x, shape[0].y - shape[3].y);
  return { from: a, along, across: { x: -along.y, y: along.x }, length, width };
}

function hatch(ctx: CanvasRenderingContext2D, shape: Polygon, gap: number, colour: string, width: number, alpha = 1) {
  const box = bounds_of(shape);
  ctx.save();
  path(ctx, shape);
  ctx.clip();
  ctx.beginPath();
  for (let x = box.x0 - (box.y1 - box.y0); x < box.x1; x += gap) {
    ctx.moveTo(x, box.y1);
    ctx.lineTo(x + (box.y1 - box.y0), box.y0);
  }
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.globalAlpha = alpha;
  ctx.stroke();
  ctx.restore();
}

function ripples(ctx: CanvasRenderingContext2D, shape: Polygon, palette: Palette, scale: number, time: number) {
  const box = bounds_of(shape);
  ctx.save();
  path(ctx, shape);
  ctx.clip();
  ctx.beginPath();
  for (let y = box.y0 + 0.8; y < box.y1; y += 1.6) {
    const row = Math.round(y * 7);
    for (let x = box.x0 + (row % 3) * 0.7; x < box.x1; x += 2.2) {
      const drift = Math.sin(time * 0.8 + row) * 0.25;
      ctx.moveTo(x + drift, y);
      ctx.quadraticCurveTo(x + drift + 0.35, y - 0.18, x + drift + 0.7, y);
    }
  }
  ctx.strokeStyle = palette.water_edge;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = Math.max(0.05, 1.2 / scale);
  ctx.stroke();
  ctx.restore();
}

function planks(ctx: CanvasRenderingContext2D, shapes: Polygon[], palette: Palette, scale: number) {
  if (shapes.length === 0) return;
  outlined(ctx, shapes, palette.load, palette.load_edge, Math.max(0.04, 1.5 / scale));
  ctx.beginPath();
  for (const shape of shapes) {
    const { from, along, across, length, width } = axis(shape);
    for (const share of [-0.22, 0.2]) {
      const off = share * width;
      ctx.moveTo(from.x + across.x * off, from.y + across.y * off);
      ctx.lineTo(from.x + across.x * off + along.x * length, from.y + across.y * off + along.y * length);
    }
    for (let s = 1.6; s < length; s += 2.4) {
      const at = { x: from.x + along.x * s, y: from.y + along.y * s };
      ctx.moveTo(at.x + across.x * width * 0.45, at.y + across.y * width * 0.45);
      ctx.lineTo(at.x - across.x * width * 0.45, at.y - across.y * width * 0.45);
    }
  }
  ctx.strokeStyle = palette.load_edge;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(0.025, 0.8 / scale);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function treads(ctx: CanvasRenderingContext2D, shapes: Polygon[], fill_colour: string, palette: Palette, scale: number, gap: number) {
  if (shapes.length === 0) return;
  outlined(ctx, shapes, fill_colour, palette.edge, Math.max(0.04, 1.5 / scale));
  ctx.beginPath();
  for (const shape of shapes) {
    const { from, along, across, length, width } = axis(shape);
    for (let s = gap / 2; s < length; s += gap) {
      const at = { x: from.x + along.x * s, y: from.y + along.y * s };
      ctx.moveTo(at.x + across.x * width * 0.38, at.y + across.y * width * 0.38);
      ctx.lineTo(at.x - across.x * width * 0.38, at.y - across.y * width * 0.38);
    }
  }
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = Math.max(0.03, 1 / scale);
  ctx.stroke();
}

function of(pieces: Piece[], kind: GroundKind): Polygon[] {
  return pieces.filter((piece) => piece.kind === kind).map((piece) => piece.shape);
}

export function draw_course(ctx: CanvasRenderingContext2D, course: Course, scale: number, palette: Palette, time: number) {
  const layout = layout_of(course);
  for (const hazard of layout.hazards) {
    if (hazard.kind === HazardKind.WATER) {
      fill(ctx, hazard.shape, palette.water);
      ripples(ctx, hazard.shape, palette, scale, time);
    } else {
      fill(ctx, hazard.shape, palette.ink);
      hatch(ctx, hazard.shape, hazard.kind === HazardKind.PIT ? 0.9 : 1.6, palette.glow, Math.max(0.06, 2 / scale), 0.14);
    }
  }
  // Walls draw translucent, which over a pit or the water reads as more of it: they stand on solid ground.
  for (const solid of layout.solids) fill(ctx, solid.shape, palette.pavement);
  const pieces = layout.pieces;
  const edge = Math.max(0.08, 2.5 / scale);
  const ground = [...of(pieces, GroundKind.PAD), ...of(pieces, GroundKind.ROAD)];
  // The edge over the drop is a warning stripe: the road's own colour reads as safe right up to it.
  if (ground.length > 0) {
    ctx.save();
    union(ctx, layout.hazards.map((hazard) => hazard.shape));
    ctx.clip();
    union(ctx, ground);
    ctx.strokeStyle = palette.warning;
    ctx.lineWidth = edge * 2;
    ctx.setLineDash([0.6, 0.6]);
    ctx.lineJoin = "miter";
    ctx.stroke();
    ctx.restore();
    union(ctx, ground);
    ctx.fillStyle = of(pieces, GroundKind.ROAD).length > 0 ? palette.asphalt : palette.floor;
    ctx.fill();
  }
  const raised = pieces.filter((piece) => RAISED.has(piece.kind)).map((piece) => piece.shape);
  if (layout.lorry) {
    fill(ctx, shifted(layout.lorry.frame, LIFT), palette.shadow);
    outlined(ctx, [layout.lorry.frame], palette.steel, palette.edge, Math.max(0.04, 1.5 / scale));
    hatch(ctx, layout.lorry.frame, 0.45, palette.edge, Math.max(0.03, 1 / scale));
  }
  if (raised.length > 0) {
    union(ctx, raised.map((shape) => shifted(shape, LIFT)));
    ctx.fillStyle = palette.shadow;
    ctx.fill();
  }
  outlined(ctx, of(pieces, GroundKind.QUAY), palette.pavement, palette.kerb, edge);
  outlined(ctx, of(pieces, GroundKind.BRIDGE), palette.pavement, palette.kerb, edge);
  planks(ctx, of(pieces, GroundKind.PLANK), palette, scale);
  treads(ctx, of(pieces, GroundKind.RAMP), palette.steel, palette, scale, 0.3);
  treads(ctx, of(pieces, GroundKind.DECK), palette.stock, palette, scale, 0.6);
}

/** Over the solids: the lorry's cab, which collides as a wall but should read as a cab. */
export function draw_course_over(ctx: CanvasRenderingContext2D, course: Course, scale: number, palette: Palette) {
  const lorry = layout_of(course).lorry;
  if (!lorry) return;
  const paint = palette.cars[0];
  outlined(ctx, [lorry.cab], paint.body, palette.edge, Math.max(0.04, 1.5 / scale));
  const box = bounds_of(lorry.cab);
  const inset = 0.25;
  fill(
    ctx,
    [
      { x: box.x0 + inset, y: box.y0 + 0.25 },
      { x: box.x1 - inset, y: box.y0 + 0.25 },
      { x: box.x1 - inset * 1.6, y: box.y0 + 0.85 },
      { x: box.x0 + inset * 1.6, y: box.y0 + 0.85 },
    ],
    paint.glass
  );
  fill(ctx, [
    { x: box.x0 + inset, y: box.y0 + 1.05 },
    { x: box.x1 - inset, y: box.y0 + 1.05 },
    { x: box.x1 - inset, y: box.y1 - 0.25 },
    { x: box.x0 + inset, y: box.y1 - 0.25 },
  ], paint.roof);
}
