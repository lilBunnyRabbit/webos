import type { Insets } from "../../core/camera";
import { begin_frame, contact_rings, fill, guides, outlined, path, player, solids, type Palette, type View } from "../../core/draw";
import { rect, type Vec } from "../../core/geometry";
import { SolidKind, type Solid } from "../../core/scene";
import { Gear, VEHICLES } from "../../core/vehicle";
import { lane_centre, RAMP, type Deck } from "./deck";
import { MAX_GAP, MIN_GAP, spec_of, Status, vehicle_of, verdict_of, type GameState, type Stowed } from "./game";

export interface Extras {
  guides: boolean;
  time: number;
  insets: Insets;
  font: string;
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
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.04, 1 / scale);
  ctx.beginPath();
  for (let x = -RAMP + 0.3; x < 0; x += 0.4) {
    ctx.moveTo(x, deck.ramp[0] + 0.1);
    ctx.lineTo(x, deck.ramp[1] - 0.1);
  }
  ctx.stroke();
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = Math.max(0.08, 2 / scale);
  ctx.beginPath();
  for (const y of deck.ramp) {
    ctx.moveTo(-RAMP, y);
    ctx.lineTo(0, y);
  }
  ctx.stroke();
}

function lanes(ctx: CanvasRenderingContext2D, deck: Deck, scale: number, palette: Palette) {
  ctx.strokeStyle = palette.paint;
  ctx.lineWidth = Math.max(0.1, 1.25 / scale);
  ctx.setLineDash([1.2, 0.8]);
  ctx.beginPath();
  for (let k = 1; k < deck.lanes; k++) {
    ctx.moveTo(0.3, k * deck.lane_width);
    ctx.lineTo(deck.length - 0.2, k * deck.lane_width);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = palette.warning;
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = Math.max(0.12, 2 / scale);
  ctx.beginPath();
  ctx.moveTo(0.05, deck.ramp[0]);
  ctx.lineTo(0.05, deck.ramp[1]);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

function fronts(deck: Deck, stowed: readonly Stowed[]): number[] {
  return Array.from({ length: deck.lanes }, (_, lane) => {
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
    if (x0 < 1) return;
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

function waiting(state: GameState): Solid[] {
  const { deck } = state;
  const items: Solid[] = [];
  deck.waiting.forEach((pose, i) => {
    if (i <= state.current) return;
    const vehicle = deck.queue[i];
    const spec = VEHICLES[vehicle];
    items.push({ kind: SolidKind.CAR, shape: [], car: { pose, length: spec.length, width: spec.width, paint: i, vehicle } });
  });
  return items;
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
  ramp(ctx, deck, scale, palette);
  lanes(ctx, deck, scale, palette);

  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  if (state.status === Status.DRIVING || state.status === Status.READY || state.status === Status.PAUSED) stop_zones(ctx, state, scale, pulse, palette);

  // The water by the ramp only stops a vehicle: drawn, its boxes would show on the open water.
  solids(ctx, deck.solids.filter((solid) => solid.kind !== SolidKind.WATER), scale, palette);
  solids(ctx, waiting(state), scale, palette);
  solids(ctx, state.stowed.flatMap((each) => each.solids.slice(0, 1)), scale, palette);

  const items: Tag[] = [];
  const size = Math.max(10, Math.min(15, scale * 0.6));
  for (let lane = 0; lane < deck.lanes; lane++) {
    items.push({ at: { x: 1.2, y: lane_centre(deck, lane) }, text: String(lane + 1), size, colour: palette.paint });
  }
  const side = Math.max(10, Math.min(13, scale * 0.5));
  items.push({ at: { x: deck.length / 2, y: -1.4 }, text: "Port", size: side, colour: palette.paint });
  items.push({ at: { x: deck.length / 2, y: deck.width + 1.4 }, text: "Starboard", size: side, colour: palette.paint });
  tags(ctx, items, view, extras.font);

  if (state.status !== Status.DONE) {
    const spec = spec_of(state);
    if (extras.guides && state.status === Status.DRIVING && state.car.gear !== Gear.PARK) guides(ctx, state.car, spec, scale, palette);
    player(ctx, state.car, vehicle_of(state), spec, state.car.brake > 0.05 && state.car.gear !== Gear.PARK, scale, palette, extras.time);
  }
  if (state.status === Status.CRASHED && state.contact) contact_rings(ctx, state.contact, pulse, scale, palette);
}
