import type { Insets } from "../../core/camera";
import {
  bay_pointer,
  begin_frame,
  contact_rings,
  fill,
  guides,
  outlined,
  pallet,
  PalletLoad,
  path,
  player,
  solids,
  union,
  type Palette,
  type View,
} from "../../core/draw";
import type { Polygon, Pose, Vec } from "../../core/geometry";
import { SolidKind } from "../../core/scene";
import { Gear, Vehicle } from "../../core/vehicle";
import { carried_pose, fork_depth, objective, SPEC, Status, type GameState } from "./game";
import { PALLET, pallet_shape, SlotKind, type Slot } from "./warehouse";

export interface Extras {
  guides: boolean;
  time: number;
  insets: Insets;
  font: string;
}

function centre(shape: Polygon): Vec {
  return shape.reduce((sum, p) => ({ x: sum.x + p.x / shape.length, y: sum.y + p.y / shape.length }), { x: 0, y: 0 });
}

function to_screen(at: Vec, view: View): Vec {
  return { x: view.width / 2 + (at.x - view.x) * view.scale, y: view.height / 2 + (at.y - view.y) * view.scale };
}

interface Tag {
  at: Vec;
  text: string;
  size: number;
  colour: string;
  /** A filled pill behind the text, for the job's own markers. */
  pill?: string;
  /** The pill's outline, the palette's edge without it. */
  ring?: string;
}

// Names are drawn in screen pixels after the world, so they stay readable at any zoom and never turn with the camera.
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

function racks(ctx: CanvasRenderingContext2D, state: GameState, scale: number, palette: Palette) {
  const { floor } = state;
  union(ctx, floor.footprints);
  ctx.fillStyle = palette.asphalt;
  ctx.fill();
  ctx.lineCap = "butt";
  ctx.strokeStyle = palette.beam;
  ctx.lineWidth = Math.max(0.07, 1.5 / scale);
  ctx.beginPath();
  for (const face of floor.faces) {
    for (const y of [face.front - face.facing * 0.05, face.back + face.facing * 0.05]) {
      ctx.moveTo(face.x0, y);
      ctx.lineTo(face.x1, y);
    }
  }
  ctx.stroke();
  outlined(ctx, floor.rails, palette.beam, palette.ink, 1 / scale);
  outlined(ctx, floor.uprights, palette.upright, palette.ink, 1 / scale);
}

function dock(ctx: CanvasRenderingContext2D, state: GameState, scale: number, palette: Palette) {
  const { floor } = state;
  ctx.strokeStyle = palette.paint;
  ctx.lineJoin = "miter";
  ctx.lineWidth = Math.max(0.08, 1.25 / scale);
  for (const slot of floor.slots) {
    if (slot.kind !== SlotKind.DOCK) continue;
    path(ctx, slot.shape);
    ctx.stroke();
  }
  // A dock door: a shutter in the south wall with a rubber bumper either side.
  for (const [a, b] of floor.doors) {
    const shutter = [
      { x: a.x, y: a.y - 0.02 },
      { x: b.x, y: b.y - 0.02 },
      { x: b.x, y: b.y + 0.3 },
      { x: a.x, y: a.y + 0.3 },
    ];
    fill(ctx, shutter, palette.pavement);
    ctx.strokeStyle = palette.wall_edge;
    ctx.lineWidth = Math.max(0.03, 1 / scale);
    ctx.beginPath();
    for (let x = a.x + 0.25; x < b.x; x += 0.25) {
      ctx.moveTo(x, a.y);
      ctx.lineTo(x, a.y + 0.28);
    }
    ctx.stroke();
    for (const x of [a.x - 0.22, b.x + 0.02]) {
      ctx.fillStyle = palette.ink;
      ctx.fillRect(x, a.y - 0.18, 0.2, 0.18);
    }
  }
}

function charger(ctx: CanvasRenderingContext2D, state: GameState, scale: number, palette: Palette) {
  const shape = state.floor.charger;
  ctx.save();
  path(ctx, shape);
  ctx.clip();
  ctx.strokeStyle = palette.warning;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 0.1;
  ctx.beginPath();
  const x0 = shape[0].x;
  const y0 = shape[0].y;
  const x1 = shape[2].x;
  const y1 = shape[2].y;
  for (let k = x0 - (y1 - y0); k < x1; k += 0.6) {
    ctx.moveTo(k, y1);
    ctx.lineTo(k + (y1 - y0), y0);
  }
  ctx.stroke();
  ctx.restore();
  path(ctx, shape);
  ctx.strokeStyle = palette.warning;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(0.06, 1.5 / scale);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function lines(ctx: CanvasRenderingContext2D, state: GameState, scale: number, palette: Palette) {
  ctx.strokeStyle = palette.beam;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(0.1, 1.5 / scale);
  ctx.setLineDash([0.9, 0.5]);
  ctx.beginPath();
  for (const [a, b] of state.floor.lines) {
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

function slot_mark(ctx: CanvasRenderingContext2D, slot: Slot, colour: string, fill_colour: string | null, width: number, dash: number[] = []) {
  if (fill_colour) fill(ctx, slot.shape, fill_colour);
  path(ctx, slot.shape);
  ctx.strokeStyle = colour;
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.setLineDash(dash);
  ctx.stroke();
  ctx.setLineDash([]);
}

function ring(ctx: CanvasRenderingContext2D, pose: Pose, colour: string, width: number, grow: number) {
  const outline = pallet_shape({ ...pose });
  const c = centre(outline);
  const grown = outline.map((p) => ({ x: c.x + (p.x - c.x) * grow, y: c.y + (p.y - c.y) * grow }));
  path(ctx, grown);
  ctx.strokeStyle = colour;
  ctx.lineJoin = "round";
  ctx.lineWidth = width;
  ctx.stroke();
}

function names(state: GameState, scale: number, palette: Palette): Tag[] {
  const { floor } = state;
  const items: Tag[] = [];
  // Rack names grow with the zoom up to a size that reads without crowding the bays (about 1.4 m apart).
  const small = Math.max(10, Math.min(17, scale * 0.36));
  if (scale > 14) {
    for (const slot of floor.slots) {
      if (slot.kind !== SlotKind.RACK) continue;
      const at = { x: slot.home.x, y: slot.home.y - Math.sin(slot.heading) * (PALLET.length / 2 + 0.57) };
      items.push({ at, text: slot.name, size: small, colour: palette.paint });
    }
  }
  for (const slot of floor.slots) {
    if (slot.kind !== SlotKind.DOCK) continue;
    const size = Math.max(10, Math.min(14, scale * 0.55));
    // Spots are 3 m apart: far out "Dock A" runs into "Dock B", so only the letter shows.
    const text = scale * 3 < size * 5 ? slot.name.slice(-1) : slot.name;
    items.push({ at: { x: slot.home.x, y: slot.home.y - 1.75 }, text, size, colour: palette.paint });
  }
  return items;
}

export function draw_scene(ctx: CanvasRenderingContext2D, state: GameState, view: View, palette: Palette, extras: Extras) {
  const { scale } = view;
  const { floor } = state;
  begin_frame(ctx, view, palette);
  fill(ctx, floor.floor, palette.floor);
  charger(ctx, state, scale, palette);
  lines(ctx, state, scale, palette);
  racks(ctx, state, scale, palette);
  dock(ctx, state, scale, palette);

  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  const line = Math.max(0.08, 2 / scale);
  const playing = state.status !== Status.DONE;
  const goal = playing ? objective(state) : null;
  const carrying = state.loads[state.current]?.carried ?? null;
  // The job's targets: the current one is outlined and glows (pulsing once its pallet is on the forks), the ones still
  // to come are dashed, the ones done are green.
  floor.tasks.forEach((task, i) => {
    const load = state.loads[i];
    if (load.placed) slot_mark(ctx, task.to, palette.parked, palette.parked_fill, Math.max(0.06, 2.5 / scale));
    else if (playing && i === state.current) {
      ctx.save();
      ctx.shadowColor = palette.target;
      ctx.shadowBlur = (carrying ? 10 + 8 * pulse : 8) * view.dpr;
      ctx.globalAlpha = carrying ? 0.75 + 0.25 * pulse : 0.9;
      slot_mark(ctx, task.to, palette.target, palette.target_fill, Math.max(0.1, 3 / scale));
      ctx.restore();
    } else slot_mark(ctx, task.to, palette.free, null, line, [0.3, 0.2]);
  });

  outlined(
    ctx,
    floor.solids.filter((solid) => solid.kind === SolidKind.WALL).map((solid) => solid.shape),
    palette.wall,
    palette.wall_edge,
    3 / scale
  );
  solids(
    ctx,
    floor.solids.filter((solid) => solid.kind === SolidKind.PILLAR),
    scale,
    palette
  );
  const current = state.loads[state.current];


  tags(ctx, names(state, scale, palette), view, extras.font, palette);

  if (extras.guides && state.status === Status.DRIVING && state.car.gear !== Gear.PARK) guides(ctx, state.car, SPEC, scale, palette);
  player(ctx, state.car, Vehicle.FORKLIFT, SPEC, state.car.brake > 0.05 && state.car.gear !== Gear.PARK, scale, palette, extras.time);
  // Pallets go over the forklift: its tines slide in under the deck, and nothing else of it can overlap one.
  for (const pose of floor.stock) pallet(ctx, pose, PALLET.length, PALLET.width, PalletLoad.WRAPPED, scale, palette);
  state.loads.forEach((each) => {
    if (!each.carried) pallet(ctx, each.pose, PALLET.length, PALLET.width, PalletLoad.BOXES, scale, palette);
  });
  const load = carried_pose(state);
  if (load) pallet(ctx, load, PALLET.length, PALLET.width, PalletLoad.BOXES, scale, palette);
  if (playing && current && !current.carried) {
    ctx.globalAlpha = 0.6 + 0.4 * pulse;
    ring(ctx, current.pose, palette.target, Math.max(0.08, 2.5 / scale), 1.18);
    ctx.globalAlpha = 1;
  }

  if (state.status === Status.CRASHED && state.contact) contact_rings(ctx, state.contact, pulse, scale, palette);

  const items: Tag[] = [];
  const badge = Math.max(11, Math.min(15, scale * 0.6));
  floor.tasks.forEach((task, i) => {
    const each = state.loads[i];
    if (each.placed || each.carried) return;
    const mine = playing && i === state.current;
    // With the forks going in, the forklift stands where the number would be.
    if (mine && fork_depth(state) !== null) return;
    // Close enough to see its load, the number moves into the aisle at the pallet's open face, where the forks go in.
    const out = scale < 25 ? 0 : PALLET.length / 2 + 0.4;
    const at = { x: each.pose.x - Math.cos(each.pose.heading) * out, y: each.pose.y - Math.sin(each.pose.heading) * out };
    items.push({ at, text: String(i + 1), size: badge, colour: mine ? palette.void : palette.paint, pill: mine ? palette.target : palette.floor, ring: mine ? undefined : palette.free });
  });
  floor.tasks.forEach((task, i) => {
    const each = state.loads[i];
    if (each.placed) return;
    const at = centre(task.to.shape);
    if (playing && i === state.current) {
      // Once the load is over its target the pill would hide how it sits; the glowing outline is enough there.
      if (load && Math.hypot(load.x - at.x, load.y - at.y) < 1.2) return;
      items.push({ at, text: `→${i + 1}`, size: badge, colour: palette.void, pill: palette.target });
    }
    else items.push({ at, text: `→${i + 1}`, size: badge * 0.85, colour: palette.paint, pill: palette.floor, ring: palette.free });
  });
  tags(ctx, items, view, extras.font, palette);

  if (goal && state.status === Status.DRIVING) {
    ctx.save();
    bay_pointer(ctx, { shape: carrying ? goal.shape : pallet_shape(current!.pose), heading: goal.heading, either: false }, view, extras.insets, palette);
    ctx.restore();
  }
}
