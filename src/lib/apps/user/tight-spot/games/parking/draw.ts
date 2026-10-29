import type { Insets } from "../../core/camera";
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
import { Gear } from "../../core/vehicle";
import { spec_of, Status, type GameState } from "./game";

export interface Extras {
  guides: boolean;
  sensors: Record<End, number | null>;
  time: number;
  /** What sits over the board's edges (the HUD, sideways touch controls), the same strips the camera keeps clear of. */
  insets: Insets;
  font: string;
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

  const open = state.round.scenario === null;
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

  if (extras.guides && state.status === Status.DRIVING) guides(ctx, state.car, spec, scale, palette);
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
