import type { Insets } from "../../core/camera";
import { bay_outline, bay_pointer, begin_frame, contact_rings, player, solids, union, type Palette, type View } from "../../core/draw";
import type { Polygon, Vec } from "../../core/geometry";
import type { Signal } from "../../core/signal";
import { Gear, Vehicle } from "../../core/vehicle";
import { SPEC, Status, type GameState } from "./game";
import {
  ControlKind,
  HALF,
  ISLAND,
  light_at,
  Light,
  MOUTH,
  NodeKind,
  PAVEMENT,
  pavement_shape,
  RING_OUT,
  ROUND_MOUTH,
  road_shape,
  SignKind,
  Turn,
  type Arrow,
  type LightPost,
  type Node,
  type Sign,
  type Town,
} from "./town";

export interface DrawExtras {
  time: number;
  guides: boolean;
  signal: Signal;
  insets: Insets;
  font: string;
}

const CONTACT_FADE_MS = 1500;
const FILLET = MOUTH - HALF;

type Arms = { n: boolean; e: boolean; s: boolean; w: boolean };

function arms_of(town: Town, node: Node): Arms {
  const arms: Arms = { n: false, e: false, s: false, w: false };
  for (const road of Object.values(town.roads)) {
    const ends = [
      [road.from, road.u.x, road.u.y],
      [road.to, -road.u.x, -road.u.y],
    ] as const;
    for (const [id, x, y] of ends) {
      if (id !== node.id) continue;
      if (Math.abs(x) > Math.abs(y)) arms[x > 0 ? "e" : "w"] = true;
      else arms[y > 0 ? "s" : "n"] = true;
    }
  }
  if (node.kind === NodeKind.DRIVEWAY) arms.n = true;
  return arms;
}

// Walked clockwise from the top-left corner, each corner rounded where two arms meet, straight where the kerb runs on.
function junction_shape(node: Node, arms: Arms): Vec[] {
  const order = [arms.w, arms.n, arms.e, arms.s, arms.w];
  const points: Vec[] = [];
  for (let k = 0; k < 4; k++) {
    const before = order[k];
    const after = order[k + 1];
    const corner: Vec[] = [];
    if (before && after) {
      for (let i = 0; i <= 8; i++) {
        const angle = Math.PI / 2 - (i / 8) * (Math.PI / 2);
        corner.push({ x: -MOUTH + Math.cos(angle) * FILLET, y: -MOUTH + Math.sin(angle) * FILLET });
      }
    } else if (before) corner.push({ x: -MOUTH, y: -HALF }, { x: -HALF, y: -HALF });
    else if (after) corner.push({ x: -HALF, y: -HALF }, { x: -HALF, y: -MOUTH });
    else corner.push({ x: -HALF, y: -HALF });
    for (const p of corner) {
      let { x, y } = p;
      for (let r = 0; r < k; r++) [x, y] = [-y, x];
      points.push({ x: node.at.x + x, y: node.at.y + y });
    }
  }
  return points;
}

function flare(node: Node, angle: number): Vec[] {
  const local = [
    [ROUND_MOUTH, -HALF],
    [ROUND_MOUTH, HALF],
    [12, 9],
    [10, 9],
    [10, -9],
    [12, -9],
  ];
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return local.map(([along, across]) => ({ x: node.at.x + along * cos - across * sin, y: node.at.y + along * sin + across * cos }));
}

function circle(ctx: CanvasRenderingContext2D, at: Vec, r: number) {
  ctx.moveTo(at.x + r, at.y);
  ctx.arc(at.x, at.y, r, 0, Math.PI * 2);
}

function grow(shape: Polygon, by: number): Vec[] {
  const xs = shape.map((p) => p.x);
  const ys = shape.map((p) => p.y);
  const x0 = Math.min(...xs) - by;
  const x1 = Math.max(...xs) + by;
  const y0 = Math.min(...ys) - by;
  const y1 = Math.max(...ys) + by;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

function ground(ctx: CanvasRenderingContext2D, town: Town, scale: number, palette: Palette) {
  const { bounds } = town;
  ctx.fillStyle = palette.grass;
  ctx.fillRect(bounds.x0 - 200, bounds.y0 - 200, bounds.x1 - bounds.x0 + 400, bounds.y1 - bounds.y0 + 400);

  const nodes = Object.values(town.nodes);
  ctx.beginPath();
  for (const road of Object.values(town.roads)) {
    const shape = pavement_shape(road);
    shape.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  }
  for (const node of nodes) {
    if (node.kind === NodeKind.ROUNDABOUT) circle(ctx, node.at, ROUND_MOUTH + 1);
    else ctx.rect(node.at.x - MOUTH, node.at.y - MOUTH, MOUTH * 2, MOUTH * 2);
  }
  for (const shape of town.paved) {
    const g = grow(shape, PAVEMENT);
    ctx.rect(g[0].x, g[0].y, g[2].x - g[0].x, g[2].y - g[0].y);
  }
  ctx.fillStyle = palette.pavement;
  ctx.fill("nonzero");

  const asphalt: Polygon[] = [...Object.values(town.roads).map(road_shape), ...town.paved];
  for (const node of nodes) {
    if (node.kind === NodeKind.ROUNDABOUT) {
      for (const angle of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) asphalt.push(flare(node, angle));
    } else asphalt.push(junction_shape(node, arms_of(town, node)));
  }
  union(ctx, asphalt);
  for (const node of nodes) if (node.kind === NodeKind.ROUNDABOUT) circle(ctx, node.at, RING_OUT);
  ctx.fillStyle = palette.asphalt;
  ctx.fill("nonzero");

  for (const node of nodes) {
    if (node.kind !== NodeKind.ROUNDABOUT) continue;
    ctx.beginPath();
    circle(ctx, node.at, ISLAND);
    ctx.fillStyle = palette.hedge;
    ctx.fill();
    ctx.lineWidth = Math.max(0.25, 3 / scale);
    ctx.strokeStyle = palette.kerb;
    ctx.stroke();
  }
}

function markings(ctx: CanvasRenderingContext2D, town: Town, state: GameState, scale: number, palette: Palette) {
  const width = Math.max(0.12, 1.2 / scale);
  ctx.lineCap = "butt";
  ctx.strokeStyle = palette.paint;
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const line of town.lines) {
    if (!line.solid) continue;
    ctx.moveTo(line.a.x, line.a.y);
    ctx.lineTo(line.b.x, line.b.y);
  }
  ctx.stroke();
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  for (const line of town.lines) {
    if (line.solid) continue;
    ctx.moveTo(line.a.x, line.a.y);
    ctx.lineTo(line.b.x, line.b.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  for (const stop of town.stops) {
    ctx.lineWidth = Math.max(0.3, 2.5 / scale);
    if (stop.kind === ControlKind.GIVE_WAY) ctx.setLineDash([0.6, 0.45]);
    ctx.beginPath();
    ctx.moveTo(stop.a.x, stop.a.y);
    ctx.lineTo(stop.b.x, stop.b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.fillStyle = palette.paint;
  for (const zebra of town.zebras) {
    const [p0, p1, , p3] = zebra;
    const across = { x: p3.x - p0.x, y: p3.y - p0.y };
    const span = Math.hypot(across.x, across.y);
    const unit = { x: across.x / span, y: across.y / span };
    const along = { x: p1.x - p0.x, y: p1.y - p0.y };
    for (let k = 0.25; k + 0.5 <= span; k += 1) {
      const a = { x: p0.x + unit.x * k, y: p0.y + unit.y * k };
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(a.x + along.x, a.y + along.y);
      ctx.lineTo(a.x + along.x + unit.x * 0.5, a.y + along.y + unit.y * 0.5);
      ctx.lineTo(a.x + unit.x * 0.5, a.y + unit.y * 0.5);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.1, 1 / scale);
  ctx.beginPath();
  for (const bay of town.bays) {
    const [a, b, c, d] = bay;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(d.x, d.y);
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(c.x, c.y);
  }
  ctx.stroke();
  const parked = state.park !== null;
  bay_outline(ctx, town.bay, parked ? palette.parked : palette.target, parked ? palette.parked_fill : palette.target_fill, Math.max(0.12, 2 / scale));

  for (const arrow of town.arrows) lane_arrow(ctx, arrow, palette);
}

function lane_arrow(ctx: CanvasRenderingContext2D, arrow: Arrow, palette: Palette) {
  ctx.save();
  ctx.translate(arrow.at.x, arrow.at.y);
  ctx.rotate(arrow.heading);
  ctx.strokeStyle = palette.paint;
  ctx.fillStyle = palette.paint;
  ctx.lineWidth = 0.22;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(-2.4, 0);
  ctx.lineTo(0, 0);
  ctx.stroke();
  for (const turn of arrow.turns) {
    const side = turn === Turn.LEFT ? -1 : turn === Turn.RIGHT ? 1 : 0;
    ctx.beginPath();
    if (side === 0) {
      ctx.moveTo(0, 0);
      ctx.lineTo(1.6, 0);
      ctx.stroke();
      head(ctx, { x: 2.2, y: 0 }, 0);
    } else {
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(0.9, 0, 0.9, side * 0.9);
      ctx.stroke();
      head(ctx, { x: 0.9, y: side * 1.4 }, side * (Math.PI / 2));
    }
  }
  ctx.restore();
}

function head(ctx: CanvasRenderingContext2D, tip: Vec, angle: number) {
  ctx.save();
  ctx.translate(tip.x, tip.y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-0.7, -0.45);
  ctx.lineTo(-0.7, 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function polygon(ctx: CanvasRenderingContext2D, at: Vec, r: number, sides: number, turn: number) {
  ctx.beginPath();
  for (let i = 0; i < sides; i++) {
    const angle = turn + (i / sides) * Math.PI * 2;
    const x = at.x + Math.cos(angle) * r;
    const y = at.y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

// Signs face the viewer, not the road: read from above they'd be edge-on. Never smaller than a dozen pixels across.
function sign_face(ctx: CanvasRenderingContext2D, sign: Sign, scale: number, palette: Palette, font: string) {
  const r = Math.max(0.55, 10 / scale);
  const at = sign.at;
  ctx.lineWidth = r * 0.22;
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  circle(ctx, at, Math.max(0.08, 1.5 / scale));
  ctx.fill();
  const centre = { x: at.x, y: at.y - r * 1.2 };
  ctx.strokeStyle = palette.ink;
  ctx.lineWidth = Math.max(0.05, 1.2 / scale);
  ctx.beginPath();
  ctx.moveTo(at.x, at.y);
  ctx.lineTo(centre.x, centre.y);
  ctx.stroke();
  switch (sign.kind) {
    case SignKind.SPEED: {
      ctx.beginPath();
      circle(ctx, centre, r);
      ctx.fillStyle = palette.glow;
      ctx.fill();
      ctx.lineWidth = r * 0.22;
      ctx.strokeStyle = palette.error;
      ctx.stroke();
      text(ctx, String(sign.value ?? ""), centre, r * 0.95, palette.ink, font);
      break;
    }
    case SignKind.GIVE_WAY: {
      polygon(ctx, { x: centre.x, y: centre.y - r * 0.15 }, r * 1.1, 3, Math.PI / 2);
      ctx.fillStyle = palette.glow;
      ctx.fill();
      ctx.lineWidth = r * 0.2;
      ctx.lineJoin = "round";
      ctx.strokeStyle = palette.error;
      ctx.stroke();
      break;
    }
    case SignKind.STOP: {
      polygon(ctx, centre, r, 8, Math.PI / 8);
      ctx.fillStyle = palette.error;
      ctx.fill();
      ctx.lineWidth = r * 0.08;
      ctx.strokeStyle = palette.glow;
      ctx.stroke();
      text(ctx, "STOP", centre, r * 0.55, palette.glow, font);
      break;
    }
    case SignKind.NO_ENTRY: {
      ctx.beginPath();
      circle(ctx, centre, r);
      ctx.fillStyle = palette.error;
      ctx.fill();
      ctx.fillStyle = palette.glow;
      ctx.fillRect(centre.x - r * 0.62, centre.y - r * 0.15, r * 1.24, r * 0.3);
      break;
    }
    case SignKind.ONE_WAY: {
      ctx.beginPath();
      ctx.roundRect(centre.x - r, centre.y - r, r * 2, r * 2, r * 0.25);
      ctx.fillStyle = palette.info;
      ctx.fill();
      ctx.save();
      ctx.translate(centre.x, centre.y);
      ctx.rotate(sign.facing);
      ctx.fillStyle = palette.glow;
      ctx.fillRect(-r * 0.6, -r * 0.1, r * 0.75, r * 0.2);
      ctx.beginPath();
      ctx.moveTo(r * 0.7, 0);
      ctx.lineTo(r * 0.1, -r * 0.42);
      ctx.lineTo(r * 0.1, r * 0.42);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }
  }
}

function text(ctx: CanvasRenderingContext2D, value: string, at: Vec, size: number, colour: string, font: string) {
  ctx.save();
  ctx.font = `700 ${size}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colour;
  ctx.fillText(value, at.x, at.y + size * 0.05);
  ctx.restore();
}

const LIGHT_COLOURS: Light[] = [Light.RED, Light.AMBER, Light.GREEN];

function traffic_light(ctx: CanvasRenderingContext2D, post: LightPost, ms: number, scale: number, palette: Palette) {
  const lit = light_at(post.group, ms);
  const r = Math.max(0.24, 4 / scale);
  const box = { x: post.at.x - r * 1.5, y: post.at.y - r * 4.6, w: r * 3, h: r * 9.2 };
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  ctx.roundRect(box.x, box.y, box.w, box.h, r);
  ctx.fill();
  const colour = { red: palette.error, amber: palette.warning, green: palette.success } as const;
  LIGHT_COLOURS.forEach((light, i) => {
    const centre = { x: post.at.x, y: box.y + r * 1.5 + i * r * 3.1 };
    if (light === lit) {
      ctx.beginPath();
      circle(ctx, centre, r * 2.2);
      ctx.fillStyle = light === Light.GREEN ? palette.parked_fill : light === Light.AMBER ? palette.warning_glow : palette.brake_glow;
      ctx.fill();
    }
    ctx.beginPath();
    circle(ctx, centre, r);
    ctx.globalAlpha = light === lit ? 1 : 0.22;
    ctx.fillStyle = colour[light];
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function route_ahead(ctx: CanvasRenderingContext2D, state: GameState, scale: number, palette: Palette) {
  const { route, at } = state;
  ctx.strokeStyle = palette.guide;
  ctx.lineWidth = Math.max(0.12, 2 / scale);
  ctx.setLineDash([0.8, 0.8]);
  ctx.beginPath();
  let started = false;
  for (let i = at.index; i < route.points.length && route.ss[i] < at.s + 90; i += 2) {
    const p = route.points[i];
    if (!started) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
    started = true;
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function centre_text(ctx: CanvasRenderingContext2D, town: Town, scale: number, palette: Palette, font: string) {
  const building = town.buildings[0];
  const x = (building[0].x + building[1].x) / 2;
  const y = (building[0].y + building[2].y) / 2;
  text(ctx, "TEST CENTRE", { x, y }, Math.max(2.4, 12 / scale), palette.paint, font);
}

export function draw_scene(ctx: CanvasRenderingContext2D, state: GameState, town: Town, view: View, palette: Palette, extras: DrawExtras) {
  begin_frame(ctx, view, palette);
  const scale = view.scale;
  ground(ctx, town, scale, palette);
  markings(ctx, town, state, scale, palette);
  if (extras.guides && state.status !== Status.DONE) route_ahead(ctx, state, scale, palette);
  solids(ctx, town.solids, scale, palette);
  centre_text(ctx, town, scale, palette, extras.font);
  const braking = state.car.brake > 0.05 && state.car.gear !== Gear.PARK;
  player(ctx, state.car, Vehicle.HATCH, SPEC, braking, scale, palette, extras.time, extras.signal);
  for (const post of town.lights) traffic_light(ctx, post, state.ms, scale, palette);
  for (const sign of town.signs) sign_face(ctx, sign, scale, palette, extras.font);
  if (state.contact) {
    const age = state.ms - state.contact.ms;
    if (age < CONTACT_FADE_MS || state.status === Status.DONE) contact_rings(ctx, state.contact.at, (Math.sin(extras.time * 6) + 1) / 2, scale, palette);
  }
  const heading_for_bay = state.status === Status.DRIVING && !state.park && state.at.s > state.route.lot.from - 80 && state.at.s < state.route.lot.to;
  if (heading_for_bay) bay_pointer(ctx, town.bay, view, extras.insets, palette);
}
