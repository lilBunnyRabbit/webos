import type { Insets } from "$kit/games/play2d/camera";
import { begin_frame, fill, path, type View } from "$kit/games/play2d/canvas";
import { type Palette } from "$kit/games/play2d/palette";
import { centroid, type Polygon, type Vec } from "$kit/games/play2d/geometry";
import { bay_pointer, contact_rings, guides, hitboxes, outlined, player, solids } from "../../core/draw";
import { standing_chain } from "../../core/draw-vehicles";
import { SolidKind } from "../../core/scene";
import { Gear, Vehicle } from "../../core/vehicle";
import { bump_flash, hitbox_shapes, objective, standing_shapes, Status, type GameState } from "./game";
import { TargetKind, type Target } from "./freight";

export interface Extras {
  guides: boolean;
  hitboxes: boolean;
  time: number;
  insets: Insets;
  font: string;
}

function to_screen(at: Vec, view: View): Vec {
  return { x: view.width / 2 + (at.x - view.x) * view.scale, y: view.height / 2 + (at.y - view.y) * view.scale };
}

interface Tag {
  at: Vec;
  text: string;
  size: number;
  colour: string;
  pill?: string;
  ring?: string;
}

// Names go on in screen pixels after the world, so they read at any zoom.
function tags(ctx: CanvasRenderingContext2D, items: Tag[], view: View, font: string, palette: Palette) {
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const tag of items) {
    const { x, y } = to_screen(tag.at, view);
    ctx.font = `600 ${tag.size}px ${font}`;
    if (tag.pill) {
      const width = ctx.measureText(tag.text).width + tag.size * 0.9;
      const height = tag.size * 1.5;
      ctx.beginPath();
      ctx.roundRect(x - width / 2, y - height / 2, width, height, height / 2);
      ctx.fillStyle = tag.pill;
      ctx.fill();
      ctx.strokeStyle = tag.ring ?? palette.edge;
      ctx.lineWidth = tag.ring ? 1.5 : 1;
      ctx.stroke();
    }
    ctx.fillStyle = tag.colour;
    ctx.fillText(tag.text, x, y + 0.5);
  }
  ctx.restore();
}

function mark(ctx: CanvasRenderingContext2D, shape: Polygon, colour: string, fill_colour: string | null, width: number, dash: number[] = []) {
  if (fill_colour) fill(ctx, shape, fill_colour);
  path(ctx, shape);
  ctx.strokeStyle = colour;
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}

function paint_lines(ctx: CanvasRenderingContext2D, state: GameState, scale: number, palette: Palette) {
  ctx.strokeStyle = palette.paint;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(0.1, 1.25 / scale);
  ctx.beginPath();
  for (const [a, b] of state.yard.lines) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (const target of state.yard.targets) {
    if (target.back_in) continue;
    mark(ctx, target.shape, palette.paint, null, Math.max(0.08, 1.25 / scale), target.kind === TargetKind.OUTBOUND ? [0.9, 0.6] : []);
  }
}

// A dock door: a shutter in the building's wall, the bumpers either side drawn as the posts they are.
function doors(ctx: CanvasRenderingContext2D, state: GameState, scale: number, palette: Palette) {
  for (const [a, b] of state.yard.doors) {
    const shutter = [
      { x: a.x, y: a.y - 0.3 },
      { x: b.x, y: b.y - 0.3 },
      { x: b.x, y: b.y },
      { x: a.x, y: a.y },
    ];
    fill(ctx, shutter, palette.pavement);
    ctx.strokeStyle = palette.wall_edge;
    ctx.lineWidth = Math.max(0.03, 1 / scale);
    ctx.beginPath();
    for (let x = a.x + 0.25; x < b.x; x += 0.25) {
      ctx.moveTo(x, a.y - 0.3);
      ctx.lineTo(x, a.y);
    }
    ctx.stroke();
  }
}

function name_of(target: Target, scale: number): string {
  const short = target.kind === TargetKind.DOOR ? `D${target.name.slice(5)}` : target.kind === TargetKind.BAY ? `B${target.name.slice(4)}` : target.name;
  return scale < 9 ? short : target.name;
}

function label_at(target: Target): Vec {
  const c = centroid(target.shape);
  if (!target.back_in) return c;
  // Out in the aisle by the mouth: a trailer backed in would hide it.
  const ys = target.shape.map((p) => p.y);
  const mouth = target.heading > 0 ? Math.max(...ys) : Math.min(...ys);
  return { x: c.x, y: mouth + Math.sign(target.heading) * 1.1 };
}

export function draw_scene(ctx: CanvasRenderingContext2D, state: GameState, view: View, palette: Palette, extras: Extras) {
  const { scale } = view;
  const { yard } = state;
  begin_frame(ctx, view, palette);
  fill(ctx, yard.floor, palette.asphalt);
  paint_lines(ctx, state, scale, palette);

  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  const line = Math.max(0.08, 2 / scale);
  const playing = state.status !== Status.DONE;
  const carrying = state.coupled !== null;
  yard.tasks.forEach((task, i) => {
    if (i < state.current) mark(ctx, task.to.shape, palette.parked, palette.parked_fill, Math.max(0.06, 2.5 / scale));
    else if (playing && i === state.current) {
      ctx.save();
      ctx.shadowColor = palette.target;
      ctx.shadowBlur = (carrying ? 10 + 8 * pulse : 8) * view.dpr;
      ctx.globalAlpha = carrying ? 0.75 + 0.25 * pulse : 0.9;
      mark(ctx, task.to.shape, palette.target, palette.target_fill, Math.max(0.1, 3 / scale));
      ctx.restore();
    } else mark(ctx, task.to.shape, palette.free, null, line, [0.4, 0.3]);
  });

  outlined(
    ctx,
    yard.solids.filter((solid) => solid.kind === SolidKind.WALL).map((solid) => solid.shape),
    palette.wall,
    palette.wall_edge,
    3 / scale
  );
  doors(ctx, state, scale, palette);
  solids(
    ctx,
    yard.solids.filter((solid) => solid.kind === SolidKind.POST),
    scale,
    palette
  );

  const task = yard.tasks[state.current];
  const mine = playing && task && !carrying ? state.stands[task.unit] : null;
  state.stands.forEach((stand, i) => {
    if (!stand) return;
    const unit = yard.units[i];
    standing_chain(ctx, stand, palette.cars[unit.paint % palette.cars.length], scale, palette);
  });
  if (mine) {
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.45 * pulse;
    for (const box of standing_shapes(mine).boxes) mark(ctx, box, palette.target, null, Math.max(0.08, 2.5 / scale));
    ctx.beginPath();
    ctx.arc(mine.hinge.x, mine.hinge.y, 0.45 + 0.1 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = palette.target;
    ctx.lineWidth = Math.max(0.06, 2 / scale);
    ctx.stroke();
    ctx.restore();
  }

  if (extras.guides && state.status === Status.DRIVING && state.car.gear !== Gear.PARK) guides(ctx, state.car, state.spec, scale, palette);
  player(ctx, state.car, Vehicle.SHUNTER, state.spec, state.car.brake > 0.05 && state.car.gear !== Gear.PARK, scale, palette, extras.time);

  if (extras.hitboxes) hitboxes(ctx, hitbox_shapes(state), scale, palette);
  if (bump_flash(state) && state.contact) contact_rings(ctx, state.contact, pulse, scale, palette);

  const items: Tag[] = [];
  const small = Math.max(9, Math.min(13, scale * 0.45));
  const badge = Math.max(11, Math.min(15, scale * 0.6));
  const goals = new Set(yard.tasks.slice(state.current).map((each) => each.to));
  for (const target of yard.targets) {
    if (goals.has(target)) continue;
    items.push({ at: label_at(target), text: name_of(target, scale), size: small, colour: palette.paint });
  }
  yard.tasks.forEach((each, i) => {
    if (i < state.current) return;
    const current = playing && i === state.current;
    items.push({
      at: label_at(each.to),
      text: `→${i + 1} ${name_of(each.to, scale)}`,
      size: current ? badge : badge * 0.85,
      colour: current ? palette.void : palette.paint,
      pill: current ? palette.target : palette.floor,
      ring: current ? undefined : palette.free,
    });
    const stand = state.stands[each.unit];
    if (stand && scale > 5) {
      const box = standing_shapes(stand).boxes[0];
      items.push({ at: centroid(box), text: String(i + 1), size: badge, colour: current ? palette.void : palette.paint, pill: current ? palette.target : palette.floor, ring: current ? undefined : palette.free });
    }
  });
  tags(ctx, items, view, extras.font, palette);

  const goal = playing ? objective(state) : null;
  if (goal && task && state.status === Status.DRIVING) {
    ctx.save();
    const shape = carrying ? goal.shape : standing_shapes(state.stands[task.unit]!).boxes[0];
    bay_pointer(ctx, { shape, heading: goal.heading, either: false }, view, extras.insets, palette);
    ctx.restore();
  }
}
