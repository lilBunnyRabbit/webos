import type { Insets } from "../../core/camera";
import {
  bay_outline,
  bay_pointer,
  beams,
  begin_frame,
  contact_rings,
  fill,
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
import { bounds_of, centroid, type Vec } from "../../core/geometry";
import type { End } from "../../core/sensors";
import { body_centre, Gear, Vehicle, VEHICLES } from "../../core/vehicle";
import { countdown, dented, JobKind, spec_of, Status, type GameState } from "./game";
import { BOOTH } from "./street";
import { CHUNK, toward } from "../../core/lot";

export interface Extras {
  guides: boolean;
  sensors: Record<End, number | null>;
  time: number;
  insets: Insets;
  font: string;
}

interface Tag {
  at: Vec;
  text: string;
  colour: string;
  size: number;
}

function to_screen(at: Vec, view: View): Vec {
  return { x: view.width / 2 + (at.x - view.x) * view.scale, y: view.height / 2 + (at.y - view.y) * view.scale };
}

// Screen space, so the timers stay readable however far out the view is.
function tags(ctx: CanvasRenderingContext2D, items: Tag[], view: View, palette: Palette, font: string) {
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const tag of items) {
    const { x, y } = to_screen(tag.at, view);
    ctx.font = `600 ${tag.size}px ${font}`;
    const width = ctx.measureText(tag.text).width + 8;
    const height = tag.size + 6;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - height / 2, width, height, 4);
    ctx.fillStyle = palette.void;
    ctx.globalAlpha = 0.85;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = tag.colour;
    ctx.fillText(tag.text, x, y + 0.5);
  }
  ctx.restore();
}

// Only drawn sliding: the car is solid at its place from the start, which it only takes once the car in hand is clear of it.
const SLIDE_MS = 900;

function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function booth(ctx: CanvasRenderingContext2D, scale: number, palette: Palette) {
  const box = bounds_of(BOOTH);
  fill(ctx, BOOTH, palette.wall);
  ctx.save();
  ctx.beginPath();
  ctx.rect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
  ctx.clip();
  ctx.fillStyle = palette.warning;
  for (let y = box.y0; y < box.y1; y += 0.6) ctx.fillRect(box.x0, y, box.x1 - box.x0, 0.3);
  ctx.restore();
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = Math.max(0.06, 1.5 / scale);
  ctx.strokeRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
}

export function draw_scene(ctx: CanvasRenderingContext2D, state: GameState, view: View, palette: Palette, extras: Extras) {
  const { scale } = view;
  const { street, job } = state;
  const world = street.world;
  begin_frame(ctx, view, palette);
  ground(
    ctx,
    world.chunks.flatMap((chunk) => chunk.surfaces),
    world.chunks.flatMap((chunk) => chunk.marks),
    scale,
    palette
  );

  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  const line = Math.max(0.12, 2 / scale);
  const taken = new Set(state.tickets.map((ticket) => ticket.bay));
  const parking = job?.kind === JobKind.PARK;
  const bus = job?.ticket.vehicle === Vehicle.BUS;
  for (const bay of street.bays) {
    if (taken.has(bay)) continue;
    ctx.globalAlpha = parking && !bus ? 0.65 + 0.35 * pulse : 0.8;
    bay_outline(ctx, bay, palette.free, null, line);
  }
  ctx.globalAlpha = 1;
  for (const bay of street.coach) {
    if (taken.has(bay)) continue;
    if (parking && bus) {
      ctx.globalAlpha = 0.7 + 0.3 * pulse;
      bay_outline(ctx, bay, palette.target, palette.target_fill, line);
      ctx.globalAlpha = 1;
    } else bay_outline(ctx, bay, palette.faint, null, line);
  }
  const returning = job?.kind === JobKind.RETURN;
  if (returning) ctx.globalAlpha = 0.7 + 0.3 * pulse;
  bay_outline(ctx, street.returns, returning ? palette.target : palette.paint, returning ? palette.target_fill : null, line);
  ctx.globalAlpha = 1;
  booth(ctx, scale, palette);

  const driving = job !== null && state.status !== Status.READY && state.status !== Status.OVER;
  const spec = spec_of(state);
  if (driving && palette.beams) beams(ctx, state.car, spec, palette);
  const sliding = state.lined.filter((each) => state.ms - each.since < SLIDE_MS);
  const moving = new Set(sliding.flatMap((each) => each.solids));
  solids(ctx, moving.size ? state.scene.solids.filter((solid) => !moving.has(solid)) : state.scene.solids, scale, palette);
  for (const each of sliding) {
    const left = 1 - (state.ms - each.since) / SLIDE_MS;
    const eased = left * left * left;
    ctx.save();
    ctx.translate((each.from.x - each.pose.x) * eased, (each.from.y - each.pose.y) * eased);
    solids(ctx, each.solids, scale, palette);
    ctx.restore();
  }

  if (driving) {
    if (extras.guides && state.status === Status.DRIVING && state.car.gear !== Gear.PARK) guides(ctx, state.car, spec, scale, palette);
    player(ctx, state.car, job.ticket.vehicle, spec, state.car.brake > 0.05 && state.car.gear !== Gear.PARK, scale, palette, extras.time);
    if (state.status === Status.DRIVING) sensor_arcs(ctx, state.car, spec, extras.sensors, scale, palette);
  }

  headroom(ctx, street.world.headroom, scale, palette);
  floor_labels(ctx, street.world.chunks, CHUNK, view, palette, extras.font, extras.insets);

  const size = Math.max(10, Math.min(13, scale * 0.6));
  const items: Tag[] = [];
  for (const ticket of state.tickets) {
    if (!ticket.parked || ticket === job?.ticket) continue;
    const left = countdown(ticket, state.ms);
    items.push({
      at: body_centre(ticket.parked, VEHICLES[ticket.vehicle]),
      text: left > 0 ? clock(left) : `Waiting ${clock(-left)}`,
      colour: left > 0 ? palette.paint : palette.warning,
      size,
    });
  }
  const stand = centroid(BOOTH);
  items.push({ at: { x: stand.x + 0.4, y: stand.y - 2.6 }, text: "Valet", colour: palette.paint, size });
  if (street.coach.length) {
    const coach = bounds_of(street.coach.flatMap((bay) => bay.shape));
    items.push({ at: { x: (coach.x0 + coach.x1) / 2, y: coach.y0 + 1.2 }, text: "Bus", colour: palette.paint, size });
  }
  tags(ctx, items, view, palette, extras.font);

  if (dented(state) && state.contact) contact_rings(ctx, state.contact, pulse, scale, palette);

  if (state.status === Status.DRIVING && job) {
    const goal = returning ? street.returns : bus ? street.coach[0] : null;
    if (goal) {
      ctx.save();
      bay_pointer(ctx, toward(street.world, state.car, goal), view, extras.insets, palette);
      ctx.restore();
    }
  }
}
