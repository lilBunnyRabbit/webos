import { resolve_token } from "$lib/core/utils";
import type { Insets } from "$kit/games/play2d/camera";
import { begin_frame, type View } from "$kit/games/play2d/canvas";
import type { Palette } from "$kit/games/play2d/palette";
import { hash } from "$kit/games/play2d/seed";
import type { ShipArt } from "./art";
import { BodyId } from "./bodies";
import { paint_ship } from "./draw-ship";
import { Steering, world_point, type Coefficients, type Ship } from "./lander";
import { CargoKind } from "./mission";
import { ground_at, type Pad, type Terrain } from "./world";

export interface BodyScenery {
  sky_low: string;
  sky_high: string;
  ground: string;
  ground_edge: string;
  deep: string;
  rock: string;
  rock_edge: string;
  far: string;
  near: string;
  stars: number;
}

export interface Scenery {
  bodies: Record<BodyId, BodyScenery>;
  foil: string;
  flame: string;
  flame_glow: string;
  shadow: string;
  dust: string;
}

/** The theme's tokens mixed into each body's sky and ground: grey regolith under a black sky, red dust, green hills. */
export function read_scenery(probe: HTMLElement): Scenery {
  const token = (value: string) => resolve_token(probe, value);
  const mix = (a: string, share: number, b: string) => token(`color-mix(in oklab, ${a} ${share}%, ${b})`);
  const rust = "color-mix(in oklab, var(--warning) 55%, var(--error))";
  return {
    bodies: {
      [BodyId.MOON]: {
        sky_low: mix("var(--info)", 6, "var(--background-darkest)"),
        sky_high: token("var(--background-darkest)"),
        ground: mix("var(--foreground)", 24, "var(--background-dark)"),
        ground_edge: mix("var(--foreground)", 45, "var(--background-dark)"),
        deep: mix("var(--foreground)", 12, "var(--background-darker)"),
        rock: mix("var(--foreground)", 16, "var(--background-darker)"),
        rock_edge: mix("var(--foreground)", 38, "var(--background-darker)"),
        far: mix("var(--foreground)", 10, "var(--background-darkest)"),
        near: mix("var(--foreground)", 16, "var(--background-darker)"),
        stars: 1,
      },
      [BodyId.MARS]: {
        sky_low: mix(rust, 34, "var(--background-dark)"),
        sky_high: mix(rust, 12, "var(--background-darkest)"),
        ground: mix(rust, 42, "var(--background-dark)"),
        ground_edge: mix(rust, 62, "var(--background-dark)"),
        deep: mix(rust, 22, "var(--background-darker)"),
        rock: mix(rust, 26, "var(--background-darker)"),
        rock_edge: mix(rust, 48, "var(--background-darker)"),
        far: mix(rust, 22, "var(--background-darker)"),
        near: mix(rust, 32, "var(--background-darker)"),
        stars: 0.25,
      },
      [BodyId.EARTH]: {
        sky_low: mix("var(--info)", 12, "var(--background)"),
        sky_high: mix("var(--info)", 28, "var(--background-dark)"),
        ground: mix("var(--success)", 22, "var(--background-dark)"),
        ground_edge: mix("var(--success)", 45, "var(--background-dark)"),
        deep: mix("var(--warning)", 10, "var(--background-darker)"),
        rock: mix("var(--foreground)", 18, "var(--background-darker)"),
        rock_edge: mix("var(--foreground)", 40, "var(--background-darker)"),
        far: mix("var(--info)", 10, "var(--background-light)"),
        near: mix("var(--success)", 14, "var(--background-light)"),
        stars: 0,
      },
    },
    foil: mix("var(--warning)", 70, "var(--foreground)"),
    flame: mix("var(--warning)", 70, "var(--error)"),
    flame_glow: token(`color-mix(in oklab, ${rust} 45%, transparent)`),
    shadow: token("color-mix(in oklch, var(--background-darkest) 45%, transparent)"),
    dust: token("color-mix(in oklch, var(--foreground) 55%, transparent)"),
  };
}

export interface Puff {
  x: number;
  y: number;
  age: number;
  size: number;
  drift: number;
}

export const PUFF_LIFE = 1.4;

export interface GateSign {
  pad: number;
  label: string;
  stars: number;
  locked: boolean;
  daily: boolean;
}

export interface Frame {
  ship: Ship;
  c: Coefficients;
  art: ShipArt;
  terrain: Terrain;
  body: BodyId;
  view: View;
  palette: Palette;
  scenery: Scenery;
  time: number;
  font: string;
  insets: Insets;
  puffs: readonly Puff[];
  profile: boolean;
  /** How far the profile strip moves down to clear an immersive window's exit button, px. */
  notch: number;
  gates: GateSign[];
  hangar: { x0: number; x1: number; height: number; label: string } | null;
  /** What waits on each pad: a crate or crew to pick up. */
  waiting: { pad: number; cargo: CargoKind }[];
  carrying: CargoKind | null;
  target: number | null;
  /** The way-in hint for a cave or canyon: the autopilot's waypoints toward the target pad. */
  route: { x: number; y: number }[];
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

function visible(view: View): Box {
  const half_w = view.width / 2 / view.scale;
  const half_h = view.height / 2 / view.scale;
  return { x0: view.x - half_w, x1: view.x + half_w, y0: view.y - half_h, y1: view.y + half_h };
}

function hair(view: View, px = 1): number {
  return px / view.scale;
}

function ellipse(ctx: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, colour: string) {
  ctx.beginPath();
  ctx.ellipse(x, y, Math.max(rx, 0.01), Math.max(ry, 0.01), 0, 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.fill();
}

function solid(ctx: CanvasRenderingContext2D, colour: string, edge: number, edge_colour: string) {
  ctx.lineJoin = "round";
  ctx.lineWidth = edge * 2;
  ctx.strokeStyle = edge_colour;
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.fill();
}

const SKY_TOP = 600;

function sky(ctx: CanvasRenderingContext2D, f: Frame, box: Box) {
  const s = f.scenery.bodies[f.body];
  const base = -horizon(f.terrain);
  const gradient = ctx.createLinearGradient(0, base, 0, base - SKY_TOP);
  gradient.addColorStop(0, s.sky_low);
  gradient.addColorStop(1, s.sky_high);
  ctx.fillStyle = gradient;
  ctx.fillRect(box.x0, box.y0, box.x1 - box.x0, box.y1 - box.y0);
}

/** Stars in screen space that barely drift: at real scale a near star field would fly past. */
function stars(ctx: CanvasRenderingContext2D, f: Frame) {
  const density = f.scenery.bodies[f.body].stars;
  if (!density) return;
  const { view } = f;
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  const cell = 46;
  const shift_x = -view.x * 0.02;
  const shift_y = -view.y * 0.02;
  const from_x = Math.floor(-shift_x / cell) - 1;
  const from_y = Math.floor(-shift_y / cell) - 1;
  ctx.fillStyle = f.palette.glow;
  for (let i = from_x; i < from_x + view.width / cell + 3; i++) {
    for (let j = from_y; j < from_y + view.height / cell + 3; j++) {
      const h = hash(41, i, j);
      if ((h % 100) / 100 > density * 0.7) continue;
      const x = i * cell + shift_x + (h % 37);
      const y = j * cell + shift_y + ((h >> 8) % 41);
      ctx.globalAlpha = 0.25 + ((h >> 4) % 60) / 100;
      const r = (h >> 12) % 5 === 0 ? 1.3 : 0.75;
      ctx.fillRect(x - r / 2, y - r / 2, r, r);
    }
  }
  ctx.restore();
}

/** Ridges far off on the horizon, in screen pixels, sliding past at `drift` pixels a metre flown and sinking out of sight as the ship climbs. */
const horizons = new WeakMap<Terrain, number>();

/** The area's horizon: its middle ground height, not the ground under the view, which made the ridges jump over every hill. */
function horizon(t: Terrain): number {
  let level = horizons.get(t);
  if (level === undefined) {
    const inside = t.ground.filter(([x]) => x >= t.x0 && x <= t.x1).map(([, y]) => y).sort((a, b) => a - b);
    level = inside[Math.floor(inside.length / 2)] ?? 0;
    horizons.set(t, level);
  }
  return level;
}

function ridges(ctx: CanvasRenderingContext2D, f: Frame, drift: number, sink: number, cell: number, height: number, colour: string, seed: number) {
  const { view } = f;
  const ground = view.height / 2 + (-horizon(f.terrain) - view.y) * view.scale;
  if (ground < 0) return;
  const base = (ground > view.height ? view.height + (ground - view.height) * sink : ground) + 1;
  // Fades out as the horizon drops below the board, instead of the band popping off the bottom edge.
  const fade = Math.max(0, Math.min(1, 1 - (ground - view.height) / (view.height * 0.6)));
  if (base - height > view.height || fade <= 0) return;
  const shift = -view.x * drift;
  const from = Math.floor(-shift / cell) - 1;
  const to = Math.ceil((view.width - shift) / cell) + 1;
  const peak = (i: number) => height * (0.35 + (hash(seed, i) % 1000) / 1500);
  ctx.save();
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.beginPath();
  ctx.moveTo(from * cell + shift, base);
  for (let i = from; i <= to; i++) {
    const x = i * cell + shift;
    ctx.lineTo(x + cell * 0.3, base - peak(i));
    ctx.lineTo(x + cell * 0.55, base - peak(i) * 0.7);
    ctx.lineTo(x + cell * 0.8, base - peak(i) * 0.85);
  }
  ctx.lineTo(to * cell + shift, base);
  ctx.lineTo(to * cell + shift, view.height + 2);
  ctx.lineTo(from * cell + shift, view.height + 2);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.globalAlpha = fade;
  ctx.fill();
  ctx.restore();
}

function ground(ctx: CanvasRenderingContext2D, f: Frame, box: Box) {
  const s = f.scenery.bodies[f.body];
  const t = f.terrain;
  const points = t.ground.filter(([x], i, all) => (all[i + 1]?.[0] ?? Infinity) >= box.x0 - 10 && (all[i - 1]?.[0] ?? -Infinity) <= box.x1 + 10);
  if (points.length < 2) return;
  const bottom = box.y1 + 10;
  ctx.beginPath();
  ctx.moveTo(points[0][0], bottom);
  for (const [x, y] of points) ctx.lineTo(x, -y);
  ctx.lineTo(points[points.length - 1][0], bottom);
  ctx.closePath();
  const fill = ctx.createLinearGradient(0, -Math.max(...points.map(([, y]) => y)), 0, -Math.min(...points.map(([, y]) => y)) + 40);
  fill.addColorStop(0, s.ground);
  fill.addColorStop(1, s.deep);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  points.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, -y) : ctx.lineTo(x, -y)));
  ctx.lineWidth = Math.max(0.08, hair(f.view, 1.5));
  ctx.strokeStyle = s.ground_edge;
  ctx.stroke();
  // Boulders scattered along the surface, from the x alone so they stay put.
  if (f.view.scale < 2) return;
  ctx.fillStyle = s.rock_edge;
  for (let x = Math.floor(box.x0 / 7) * 7; x < box.x1; x += 7) {
    const h = hash(19, x);
    if (h % 5 !== 0 || t.pads.some((pad) => x > pad.x0 - 4 && x < pad.x1 + 4)) continue;
    const r = 0.15 + (h % 50) / 90;
    const at = x + ((h >> 6) % 7);
    ellipse(ctx, at, -ground_at(t, at) - r * 0.35, r, r * 0.55, s.rock_edge);
  }
}

function rocks(ctx: CanvasRenderingContext2D, f: Frame) {
  const s = f.scenery.bodies[f.body];
  for (const rock of f.terrain.rocks) {
    ctx.beginPath();
    rock.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, -p.y) : ctx.lineTo(p.x, -p.y)));
    ctx.closePath();
    solid(ctx, s.rock, Math.max(0.08, hair(f.view, 1.5)), s.rock_edge);
  }
}

function pad_plate(ctx: CanvasRenderingContext2D, f: Frame, pad: Pad, index: number) {
  const { palette, view } = f;
  const edge = Math.max(0.05, hair(view, 1.25));
  const target = f.target === index;
  ctx.beginPath();
  ctx.roundRect(pad.x0, -pad.y - 0.05, pad.x1 - pad.x0, 0.5, 0.12);
  solid(ctx, palette.pavement, edge, palette.edge);
  ctx.fillStyle = target ? palette.target : palette.paint;
  const mid = (pad.x0 + pad.x1) / 2;
  ctx.fillRect(mid - 0.15, -pad.y - 0.06, 0.3, 0.07);
  for (const x of [pad.x0 + 0.6, pad.x1 - 0.6]) {
    const on = target ? Math.sin(f.time * 5 + index) > -0.2 : false;
    ellipse(ctx, x, -pad.y - 0.25, 0.22, 0.22, on ? palette.target : palette.faint);
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const radius = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
  }
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.fill();
}

function gate_signs(ctx: CanvasRenderingContext2D, f: Frame) {
  const { palette, view } = f;
  const edge = Math.max(0.05, hair(view, 1.25));
  for (const gate of f.gates) {
    const pad = f.terrain.pads[gate.pad];
    const post = pad.x1 + 1.6;
    const base = -pad.y;
    ctx.beginPath();
    ctx.roundRect(post - 0.1, base - 4.2, 0.2, 4.2, 0.1);
    solid(ctx, palette.steel, edge, palette.edge);
    const w = Math.max(3.6, gate.label.length * 0.7 + 1.2);
    ctx.beginPath();
    ctx.roundRect(post - w / 2, base - 7.2, w, 3.2, 0.4);
    solid(ctx, gate.daily ? palette.target : palette.floor, edge, palette.edge);
    if (view.scale < 1.6) continue;
    ctx.font = `600 1.3px ${f.font}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = gate.daily ? palette.floor : gate.locked ? palette.faint : palette.ink;
    ctx.fillText(gate.label, post, base - 6.15);
    for (let i = 0; i < 3; i++) star(ctx, post - 0.95 + i * 0.95, base - 4.95, 0.38, i < gate.stars ? palette.warning : palette.faint);
  }
}

function hangar(ctx: CanvasRenderingContext2D, f: Frame) {
  const h = f.hangar;
  if (!h) return;
  const { palette, view } = f;
  const edge = Math.max(0.06, hair(view, 1.25));
  const base = -ground_at(f.terrain, (h.x0 + h.x1) / 2);
  const w = h.x1 - h.x0;
  ctx.beginPath();
  ctx.moveTo(h.x0, base);
  ctx.lineTo(h.x0, base - h.height * 0.62);
  ctx.quadraticCurveTo(h.x0 + w / 2, base - h.height * 1.18, h.x1, base - h.height * 0.62);
  ctx.lineTo(h.x1, base);
  ctx.closePath();
  solid(ctx, palette.floor, edge, palette.edge);
  ctx.beginPath();
  ctx.roundRect(h.x0 + w * 0.18, base - h.height * 0.62, w * 0.64, h.height * 0.62, [0.6, 0.6, 0, 0]);
  solid(ctx, palette.garage, edge, palette.edge);
  for (let i = 1; i < 6; i++) {
    ctx.fillStyle = palette.kerb;
    ctx.fillRect(h.x0 + w * 0.18, base - (h.height * 0.62 * i) / 6, w * 0.64, hair(view, 1));
  }
  ctx.beginPath();
  ctx.roundRect(h.x0 + w * 0.3, base - h.height * 0.92, w * 0.4, 2.4, 0.4);
  solid(ctx, palette.target, edge, palette.edge);
  if (view.scale < 1.2) return;
  ctx.font = `700 1.5px ${f.font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = palette.floor;
  ctx.fillText(h.label, h.x0 + w / 2, base - h.height * 0.92 + 1.2);
}

function crate(ctx: CanvasRenderingContext2D, f: Frame, x: number, y: number, w: number, h: number) {
  const { palette, view } = f;
  const edge = Math.max(0.04, hair(view, 1.2));
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h, w, h, 0.12);
  solid(ctx, palette.load, edge, palette.load_edge);
  ctx.strokeStyle = palette.load_edge;
  ctx.lineWidth = edge;
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y - h);
  ctx.lineTo(x + w / 2, y);
  ctx.moveTo(x + w / 2, y - h);
  ctx.lineTo(x - w / 2, y);
  ctx.stroke();
}

function crew(ctx: CanvasRenderingContext2D, f: Frame, x: number, y: number) {
  const { palette, view } = f;
  const edge = Math.max(0.03, hair(view, 1));
  for (const dx of [-0.7, 0.7]) {
    ctx.beginPath();
    ctx.roundRect(x + dx - 0.3, y - 1.5, 0.6, 1.5, 0.28);
    solid(ctx, palette.glow, edge, palette.edge);
    ellipse(ctx, x + dx, y - 1.75, 0.3, 0.3, palette.glow);
    ellipse(ctx, x + dx + 0.06, y - 1.78, 0.18, 0.12, palette.info);
  }
}

function waiting(ctx: CanvasRenderingContext2D, f: Frame) {
  for (const item of f.waiting) {
    const pad = f.terrain.pads[item.pad];
    const x = pad.x1 - 2.4;
    if (item.cargo === CargoKind.CRATE) crate(ctx, f, x, -pad.y - 0.05, 2.4, 1.8);
    else crew(ctx, f, x, -pad.y - 0.05);
  }
}

function draw_ship(ctx: CanvasRenderingContext2D, f: Frame) {
  const { ship, art, palette, view, c, scenery } = f;
  ctx.save();
  ctx.translate(ship.x, -ship.y);
  ctx.rotate(-ship.angle);
  ctx.scale(1, -1);
  const split = c.spec.steering === Steering.SPLIT ? ship.turning * c.split : 0;
  const reach = Math.sqrt(art.pad / 0.75);
  paint_ship(
    ctx,
    art,
    { palette, foil: scenery.foil, flame: scenery.flame, flame_glow: scenery.flame_glow, edge: Math.max(0.035, hair(view, 1.25)), time: f.time },
    {
      stroke: ship.stroke,
      flames: art.bells.map(({ bell }) => ship.spool * (1 + split * bell.side) * (2.2 + 4 * ship.spool) * reach),
      rcs: c.spec.steering === Steering.RCS ? ship.turning : 0,
      crew: f.carrying === CargoKind.CREW,
    }
  );
  if (f.carrying === CargoKind.CRATE) {
    ctx.scale(1, -1);
    crate(ctx, f, 0, -art.sling + 1.05, 2.2, 1.0);
  }
  ctx.restore();
}

function shadow(ctx: CanvasRenderingContext2D, f: Frame) {
  const { ship, c } = f;
  const g = ground_at(f.terrain, ship.x);
  const width = Math.max(...c.spec.feet.map((p) => Math.abs(p.x))) * 1.2;
  const fade = Math.max(0, 1 - (ship.y - g) / 60);
  if (fade <= 0) return;
  ctx.globalAlpha = fade;
  ellipse(ctx, ship.x, -g + 0.05, width * (0.6 + 0.4 * fade), 0.22, f.scenery.shadow);
  ctx.globalAlpha = 1;
}

function puffs(ctx: CanvasRenderingContext2D, f: Frame) {
  for (const puff of f.puffs) {
    const t = puff.age / PUFF_LIFE;
    ctx.globalAlpha = Math.max(0, 0.45 * (1 - t));
    ellipse(ctx, puff.x + puff.drift * t * 6, -puff.y - 0.3 - t * 1.2 * puff.size, 0.4 + t * 2.6 * puff.size, 0.25 + t * 1.1 * puff.size, f.scenery.dust);
  }
  ctx.globalAlpha = 1;
}

function route(ctx: CanvasRenderingContext2D, f: Frame) {
  if (!f.route.length || f.target === null) return;
  const pad = f.terrain.pads[f.target];
  const points = [...f.route, { x: (pad.x0 + pad.x1) / 2, y: pad.y + 6 }];
  ctx.setLineDash([hair(f.view, 5), hair(f.view, 6)]);
  ctx.lineWidth = hair(f.view, 1.5);
  ctx.strokeStyle = f.palette.guide;
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, -p.y) : ctx.lineTo(p.x, -p.y)));
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 1;
}

/** The whole area in a strip, top right: the ground, rock, every pad (the next one marked) and the ship. */
function profile(ctx: CanvasRenderingContext2D, f: Frame) {
  const { view, palette, ship, terrain } = f;
  const w = Math.min(190, view.width * 0.42);
  const h = w * 0.36;
  const x0 = view.width - w - 8;
  const y0 = 8 + f.notch;
  const left = terrain.x0;
  const right = terrain.x1;
  const inside = terrain.ground.filter(([x]) => x >= left && x <= right);
  const low = Math.min(...inside.map(([, y]) => y), ...terrain.pads.map((p) => p.y)) - 10;
  const top = Math.max(...inside.map(([, y]) => y), ship.y, ...terrain.rocks.flat().map((p) => p.y)) + 20;
  const sx = (x: number) => x0 + ((x - left) / (right - left)) * w;
  const sy = (y: number) => y0 + h - 4 - ((Math.min(top, Math.max(low, y)) - low) / (top - low)) * (h - 8);
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.fillStyle = palette.floor;
  ctx.globalAlpha = 0.88;
  ctx.beginPath();
  ctx.roundRect(x0, y0, w, h, 6);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.lineWidth = 1;
  ctx.strokeStyle = palette.kerb;
  ctx.stroke();
  ctx.save();
  ctx.clip();
  ctx.beginPath();
  ctx.moveTo(x0, y0 + h);
  for (const [x, y] of inside) ctx.lineTo(sx(x), sy(y));
  ctx.lineTo(x0 + w, y0 + h);
  ctx.closePath();
  ctx.fillStyle = palette.faint;
  ctx.fill();
  for (const rock of terrain.rocks) {
    ctx.beginPath();
    rock.forEach((p, i) => (i === 0 ? ctx.moveTo(sx(p.x), sy(p.y)) : ctx.lineTo(sx(p.x), sy(p.y))));
    ctx.closePath();
    ctx.fill();
  }
  ctx.lineWidth = 3;
  terrain.pads.forEach((pad, i) => {
    ctx.strokeStyle = i === f.target ? palette.target : palette.paint;
    ctx.beginPath();
    ctx.moveTo(sx(pad.x0) - 1, sy(pad.y));
    ctx.lineTo(sx(pad.x1) + 1, sy(pad.y));
    ctx.stroke();
  });
  const px = Math.max(x0 + 4, Math.min(x0 + w - 4, sx(ship.x)));
  const py = Math.max(y0 + 4, sy(ship.y));
  ctx.beginPath();
  ctx.moveTo(px, py - 4.5);
  ctx.lineTo(px + 3.5, py + 3);
  ctx.lineTo(px - 3.5, py + 3);
  ctx.closePath();
  ctx.fillStyle = palette.target;
  ctx.fill();
  ctx.restore();
}

export function feet_ground(ship: Ship, c: Coefficients, terrain: Terrain): number {
  return Math.min(...c.spec.feet.map((foot) => world_point(ship, foot).y - ground_at(terrain, world_point(ship, foot).x)));
}

export function draw_frame(ctx: CanvasRenderingContext2D, f: Frame) {
  begin_frame(ctx, f.view, f.palette);
  const box = visible(f.view);
  const s = f.scenery.bodies[f.body];
  sky(ctx, f, box);
  stars(ctx, f);
  ridges(ctx, f, 0.05, 0.05, 380, Math.min(120, f.view.height * 0.22), s.far, 3);
  ridges(ctx, f, 0.16, 0.1, 170, Math.min(60, f.view.height * 0.11), s.near, 4);
  hangar(ctx, f);
  ground(ctx, f, box);
  f.terrain.pads.forEach((pad, i) => {
    if (pad.x1 >= box.x0 - 10 && pad.x0 <= box.x1 + 10) pad_plate(ctx, f, pad, i);
  });
  gate_signs(ctx, f);
  waiting(ctx, f);
  route(ctx, f);
  shadow(ctx, f);
  draw_ship(ctx, f);
  puffs(ctx, f);
  rocks(ctx, f);
  if (f.profile) profile(ctx, f);
}
