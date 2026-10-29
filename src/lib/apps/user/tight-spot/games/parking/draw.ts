import type { Insets } from "../../core/camera";
import type { Vec } from "../../core/geometry";
import {
  bay_arrow,
  bay_outline,
  bay_pointer,
  beams,
  begin_frame,
  contact_rings,
  floor_labels,
  ground,
  guides,
  headroom,
  player,
  sensor_arcs,
  solids,
  type Palette,
  type View,
} from "../../core/draw";
import type { End } from "../../core/sensors";
import { CHUNK, toward } from "../../core/lot";
import { body_centre, Gear } from "../../core/vehicle";
import { draw_course, draw_course_over } from "./extreme/draw";
import { course_by_id } from "./extreme/courses";
import { OFF, spec_of, Status, type GameState } from "./game";

export interface Extras {
  guides: boolean;
  sensors: Record<End, number | null>;
  time: number;
  /** What sits over the board's edges (the HUD, sideways touch controls), the same strips the camera keeps clear of. */
  insets: Insets;
  font: string;
  /** How far a car whose tyre went off has tipped over the edge, 0 to 1. */
  tip: number;
}

export function draw_scene(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  view: View,
  palette: Palette,
  extras: Extras
) {
  const { scale } = view;
  begin_frame(ctx, view, palette);

  const world = state.world;
  const spec = spec_of(state.round);
  ground(
    ctx,
    world.chunks.flatMap((chunk) => chunk.surfaces),
    world.chunks.flatMap((chunk) => chunk.marks),
    scale,
    palette
  );

  const course = state.round.course !== undefined ? course_by_id(state.round.course) : null;
  if (course) draw_course(ctx, course, scale, palette, extras.time);

  const open = state.round.scenario === null && !course;
  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  const line = Math.max(0.12, 2 / scale);
  for (const bay of world.bays) {
    const done = state.status === Status.PARKED && state.bay === bay;
    if (done) bay_outline(ctx, bay, palette.parked, palette.parked_fill, Math.max(0.16, 3 / scale));
    else if (open) bay_outline(ctx, bay, palette.free, null, line);
    else {
      ctx.globalAlpha = 0.7 + 0.3 * pulse;
      bay_outline(ctx, bay, palette.target, palette.target_fill, line);
      ctx.globalAlpha = 1;
      bay_arrow(ctx, bay, palette.target);
    }
  }

  if (palette.beams && state.status !== Status.CRASHED) beams(ctx, state.car, spec, palette);
  solids(ctx, world.solids, scale, palette);
  if (course) draw_course_over(ctx, course, scale, palette);

  if (extras.guides && state.status === Status.DRIVING) guides(ctx, state.car, spec, scale, palette);
  const tipping = state.status === Status.CRASHED && state.hit?.kind === OFF && state.contact;
  if (tipping) tip_over(ctx, body_centre(state.car, spec), state.contact!, extras.tip);
  player(
    ctx,
    state.car,
    state.round.vehicle,
    spec,
    state.car.brake > 0.05 && state.car.gear !== Gear.PARK,
    scale,
    palette,
    extras.time
  );
  if (tipping) ctx.restore();
  if (state.status === Status.DRIVING) sensor_arcs(ctx, state.car, spec, extras.sensors, scale, palette);
  headroom(ctx, world.headroom, scale, palette);
  floor_labels(ctx, world.chunks, CHUNK, view, palette, extras.font, extras.insets);

  if (!open && world.bays.length === 1 && state.status === Status.DRIVING) {
    ctx.save();
    bay_pointer(ctx, toward(world, state.car, world.bays[0]), view, extras.insets, palette);
    ctx.restore();
  }

  if (state.status === Status.CRASHED && state.contact) contact_rings(ctx, state.contact, pulse, scale, palette);
}

// Seen from above, a car going over an edge slides toward it, shrinks as it drops away and darkens.
function tip_over(ctx: CanvasRenderingContext2D, centre: Vec, edge: Vec, t: number) {
  const dx = edge.x - centre.x;
  const dy = edge.y - centre.y;
  const length = Math.hypot(dx, dy) || 1;
  const eased = t * t;
  ctx.save();
  ctx.translate(edge.x + (dx / length) * eased * 0.9, edge.y + (dy / length) * eased * 0.9);
  ctx.rotate(Math.sign(dx * dy || 1) * eased * 0.25);
  ctx.scale(1 - eased * 0.3, 1 - eased * 0.3);
  ctx.translate(-edge.x, -edge.y);
  ctx.globalAlpha = 1 - eased * 0.45;
}
