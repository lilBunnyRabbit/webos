import type { Insets } from "$kit/games/play2d/camera";
import { vehicle_solids } from "../../core/obstacles";
import { begin_frame, fill, path, type View } from "$kit/games/play2d/canvas";
import { type Palette } from "$kit/games/play2d/palette";
import { contact_rings, guides, headroom, hitboxes, outlined, player, sensor_arcs, solids, veil } from "../../core/draw";
import { rect, type Polygon, type Vec } from "$kit/games/play2d/geometry";
import { SolidKind, type Solid } from "../../core/scene";
import type { End } from "../../core/sensors";
import { bodies, create_car, Gear, rig_ends, VEHICLES, type Car, type Placement } from "../../core/vehicle";
import { lane_centre, type Cargo, type Deck } from "./deck";
import { MAX_GAP, MIN_GAP, spec_of, Status, vehicle_of, verdict_of, type GameState, type Stowed } from "./game";

export interface Extras {
  guides: boolean;
  hitboxes: boolean;
  sensors: Record<End, number | null>;
  time: number;
  insets: Insets;
  font: string;
  /** Just after a trip up or down the internal ramp the camera cuts, and the board fades in from this. */
  veil: number;
}

interface Tag {
  at: Vec;
  text: string;
  size: number;
  colour: string;
}

function to_screen(at: Vec, view: View): Vec {
  return { x: view.width / 2 + (at.x - view.x) * view.scale, y: view.height / 2 + (at.y - view.y) * view.scale };
}

function tags(ctx: CanvasRenderingContext2D, items: Tag[], view: View, font: string) {
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (const tag of items) {
    const { x, y } = to_screen(tag.at, view);
    ctx.font = `600 ${tag.size}px ${font}`;
    ctx.fillStyle = tag.colour;
    ctx.fillText(tag.text, x, y + 0.5);
  }
  ctx.restore();
}

function ramp(ctx: CanvasRenderingContext2D, deck: Deck, scale: number, palette: Palette) {
  fill(ctx, deck.ramp_shape, palette.pavement);
  const [foot_top, , , foot_bottom] = deck.ramp_shape;
  const at = (y: number, x: number) => y - deck.ramp_shift * (-x / deck.ramp_length);
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.04, 1 / scale);
  ctx.beginPath();
  for (let x = -deck.ramp_length + 0.3; x < 0; x += 0.4) {
    ctx.moveTo(x, at(deck.ramp[0], x) + 0.1);
    ctx.lineTo(x, at(deck.ramp[1], x) - 0.1);
  }
  ctx.stroke();
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = Math.max(0.08, 2 / scale);
  ctx.beginPath();
  ctx.moveTo(foot_top.x, foot_top.y);
  ctx.lineTo(0, deck.ramp[0]);
  ctx.moveTo(foot_bottom.x, foot_bottom.y);
  ctx.lineTo(0, deck.ramp[1]);
  ctx.stroke();
}

function lane_lines(ctx: CanvasRenderingContext2D, deck: Deck, from: number, offset: number, scale: number, palette: Palette) {
  ctx.strokeStyle = palette.paint;
  ctx.lineWidth = Math.max(0.1, 1.25 / scale);
  ctx.setLineDash([1.2, 0.8]);
  ctx.beginPath();
  for (let k = 1; k < deck.lanes; k++) {
    ctx.moveTo(from, offset + k * deck.lane_width);
    ctx.lineTo(deck.length - 0.2, offset + k * deck.lane_width);
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function lanes(ctx: CanvasRenderingContext2D, deck: Deck, scale: number, palette: Palette) {
  lane_lines(ctx, deck, 0.3, 0, scale, palette);
  ctx.strokeStyle = palette.warning;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(0.12, 2 / scale);
  ctx.beginPath();
  ctx.moveTo(0.05, deck.ramp[0]);
  ctx.lineTo(0.05, deck.ramp[1]);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function chevrons(ctx: CanvasRenderingContext2D, shape: Polygon, scale: number, palette: Palette) {
  fill(ctx, shape, palette.ramp);
  const x0 = Math.min(...shape.map((p) => p.x));
  const x1 = Math.max(...shape.map((p) => p.x));
  const y0 = Math.min(...shape.map((p) => p.y));
  const y1 = Math.max(...shape.map((p) => p.y));
  const middle = (y0 + y1) / 2;
  const half = (y1 - y0) / 2 - 0.6;
  ctx.strokeStyle = palette.paint;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = Math.max(0.1, 1.5 / scale);
  ctx.beginPath();
  for (let x = x0 + 1.2; x < x1 - 0.8; x += 2) {
    ctx.moveTo(x - 0.8, middle - half);
    ctx.lineTo(x, middle);
    ctx.lineTo(x - 0.8, middle + half);
  }
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function upper_deck(ctx: CanvasRenderingContext2D, deck: Deck, scale: number, palette: Palette) {
  const upper = deck.upper;
  if (!upper) return;
  outlined(ctx, [upper.hull], palette.wall, palette.wall_edge, 3 / scale);
  fill(ctx, upper.floor, palette.floor);
  chevrons(ctx, upper.ramp, scale, palette);
  chevrons(ctx, upper.head, scale, palette);
  lane_lines(ctx, deck, upper.top + 0.3, upper.offset, scale, palette);
}

function fronts(deck: Deck, stowed: readonly Stowed[]): number[] {
  const count = deck.upper ? deck.lanes * 2 : deck.lanes;
  return Array.from({ length: count }, (_, lane) => {
    let at = deck.length;
    for (const each of stowed) {
      if (each.lane !== lane) continue;
      at = Math.min(at, ...each.solids.flatMap((solid) => solid.shape.map((p) => p.x)));
    }
    return at;
  });
}

// The window the nose has to stop in, painted across each lane: the one the vehicle is in glows.
function stop_zones(ctx: CanvasRenderingContext2D, state: GameState, scale: number, pulse: number, palette: Palette) {
  const { deck } = state;
  const verdict = state.status === Status.DRIVING ? verdict_of(state) : null;
  const on_deck = verdict !== null && state.car.x > 0;
  fronts(deck, state.stowed).forEach((front, lane) => {
    const x0 = front - MAX_GAP;
    const x1 = front - MIN_GAP;
    if (x0 < (lane >= deck.lanes ? deck.upper!.top : 1)) return;
    const half = deck.lane_width / 2 - 0.2;
    const middle = lane_centre(deck, lane);
    const shape = rect(x0, middle - half, x1, middle + half);
    const mine = on_deck && verdict.lane === lane;
    if (mine) {
      ctx.globalAlpha = 0.55 + 0.35 * pulse;
      fill(ctx, shape, palette.target_fill);
      ctx.globalAlpha = 1;
    }
    path(ctx, shape);
    ctx.strokeStyle = mine ? palette.target : palette.free;
    ctx.lineWidth = Math.max(0.06, (mine ? 2.5 : 1.25) / scale);
    ctx.setLineDash(mine ? [] : [0.3, 0.2]);
    ctx.stroke();
    ctx.setLineDash([]);
  });
}

// A towing rig parked or waiting: its links drawn as the player's are, in a parked paint.
function rig(ctx: CanvasRenderingContext2D, vehicle: Cargo, at: Placement, paint: number, scale: number, palette: Palette) {
  const spec = VEHICLES[vehicle];
  const car: Car = { ...create_car(at, Gear.PARK, spec), ...at };
  player(ctx, car, vehicle, spec, false, scale, { ...palette, player: palette.cars[paint % palette.cars.length] });
}

function waiting(ctx: CanvasRenderingContext2D, state: GameState, scale: number, palette: Palette) {
  const { deck } = state;
  const items: Solid[] = [];
  deck.waiting.forEach((pose, i) => {
    if (i <= state.current) return;
    const vehicle = deck.queue[i];
    const spec = VEHICLES[vehicle];
    if (spec.hitches.length > 0) {
      const ends = rig_ends(spec);
      return rig(ctx, vehicle, { ...pose, x: pose.x + (ends.front - ends.rear) / 2 - ends.front }, i, scale, palette);
    }
    items.push({ kind: SolidKind.CAR, shape: [], car: { pose, length: spec.length, width: spec.width, paint: i, vehicle } });
  });
  solids(ctx, items, scale, palette);
}

function aboard(ctx: CanvasRenderingContext2D, stowed: readonly Stowed[], scale: number, palette: Palette) {
  const singles: Solid[] = [];
  for (const each of stowed) {
    if (VEHICLES[each.vehicle].hitches.length > 0) rig(ctx, each.vehicle, each.car, each.solids[0].car?.paint ?? 0, scale, palette);
    else singles.push(each.solids[0]);
  }
  solids(ctx, singles, scale, palette);
}

function marshalling(ctx: CanvasRenderingContext2D, deck: Deck, scale: number, palette: Palette) {
  fill(ctx, deck.marshal, palette.asphalt);
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.08, 1 / scale);
  ctx.beginPath();
  const x0 = deck.marshal[0].x + 0.5;
  const x1 = deck.marshal[1].x - 0.2;
  for (let i = 0; i <= deck.queue.length; i++) {
    const y = (deck.waiting[0]?.y ?? 0) + (i - 0.5) * 3;
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
  }
  ctx.stroke();
}

function labels(deck: Deck, scale: number, palette: Palette): Tag[] {
  const items: Tag[] = [];
  const size = Math.max(10, Math.min(15, scale * 0.6));
  const side = Math.max(10, Math.min(13, scale * 0.5));
  for (let lane = 0; lane < deck.lanes; lane++) {
    items.push({ at: { x: 1.2, y: lane_centre(deck, lane) }, text: String(lane + 1), size, colour: palette.paint });
  }
  const upper = deck.upper;
  if (upper) {
    for (let lane = deck.lanes; lane < deck.lanes * 2; lane++) {
      items.push({ at: { x: upper.top + 1.2, y: lane_centre(deck, lane) }, text: String(lane + 1), size, colour: palette.paint });
    }
    const middle = (upper.top + deck.length) / 2;
    items.push({ at: { x: middle, y: upper.offset - 1.4 }, text: "Upper deck · port", size: side, colour: palette.paint });
    items.push({ at: { x: middle, y: upper.offset + deck.beam + 1.4 }, text: "Starboard", size: side, colour: palette.paint });
    items.push({ at: { x: (upper.foot + upper.top) / 2, y: deck.beam + 1.4 }, text: "Ramp up · cars and vans", size: side, colour: palette.paint });
  }
  items.push({ at: { x: deck.length / 2, y: -1.4 }, text: upper ? "Main deck · port" : "Port", size: side, colour: palette.paint });
  if (!upper) items.push({ at: { x: deck.length / 2, y: deck.beam + 1.4 }, text: "Starboard", size: side, colour: palette.paint });
  if (deck.tide !== 0) {
    const quay = deck.quay;
    items.push({ at: { x: (quay[0].x + quay[1].x) / 2, y: quay[0].y + 1 }, text: deck.tide > 0 ? "High water" : "Low water", size: side, colour: palette.paint });
  }
  return items;
}

export function draw_scene(ctx: CanvasRenderingContext2D, state: GameState, view: View, palette: Palette, extras: Extras) {
  const { scale } = view;
  const { deck } = state;
  const { x0, y0, x1, y1 } = deck.bounds;
  begin_frame(ctx, view, palette);
  fill(ctx, rect(x0 - 50, y0 - 50, x1 + 50, y1 + 50), palette.water);
  marshalling(ctx, deck, scale, palette);
  outlined(ctx, [deck.quay], palette.pavement, palette.kerb, 3 / scale);
  outlined(ctx, [deck.hull], palette.wall, palette.wall_edge, 3 / scale);
  fill(ctx, deck.floor, palette.floor);
  if (deck.upper) chevrons(ctx, deck.upper.ramp, scale, palette);
  upper_deck(ctx, deck, scale, palette);
  ramp(ctx, deck, scale, palette);
  lanes(ctx, deck, scale, palette);

  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  if (state.status === Status.DRIVING || state.status === Status.READY || state.status === Status.PAUSED) stop_zones(ctx, state, scale, pulse, palette);

  // The water by the ramp only stops a vehicle: drawn, its boxes would show on the open water.
  solids(ctx, deck.solids.filter((solid) => solid.kind !== SolidKind.WATER), scale, palette);
  if (deck.upper) headroom(ctx, [deck.upper.bar], scale, palette);
  waiting(ctx, state, scale, palette);
  aboard(ctx, state.stowed, scale, palette);
  tags(ctx, labels(deck, scale, palette), view, extras.font);

  if (state.status !== Status.DONE) {
    const spec = spec_of(state);
    if (extras.guides && state.status === Status.DRIVING && state.car.gear !== Gear.PARK) guides(ctx, state.car, spec, scale, palette);
    player(ctx, state.car, vehicle_of(state), spec, state.car.brake > 0.05 && state.car.gear !== Gear.PARK, scale, palette, extras.time);
    if (state.status === Status.DRIVING) sensor_arcs(ctx, state.car, spec, extras.sensors, scale, palette);
  }
  if (extras.hitboxes) hitboxes(ctx, [...(state.status === Status.DONE ? [] : bodies(state.car, spec_of(state))), ...vehicle_solids(state.scene.solids)], scale, palette);
  if (state.status === Status.CRASHED && state.contact) contact_rings(ctx, state.contact, pulse, scale, palette);
  if (extras.veil > 0) veil(ctx, view, extras.veil, palette);
}
