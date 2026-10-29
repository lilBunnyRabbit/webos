import { bounds_of, type Bounds, type Vec } from "../core/geometry";
import { beams, begin_frame, contact_rings, ground, guides, path, player, sensor_arcs, solids, type Palette, type View } from "../core/draw";
import type { End } from "../core/sensors";
import { Gear, type Car, type Vehicle, type VehicleSpec } from "../core/vehicle";
import { RECESS } from "./blueprints";
import { building, house, in_plan, shadow_of, tree } from "./buildings";
import { District, to_town, type Plot, type Yard } from "./yard";

const SOON = "Soon";
// From this many pixels a metre the doorway's own sign reads, and the roof names give way to the buildings' look.
const CLOSE = 14;
const ROOF_ROOM = 15;

export interface YardScene {
  yard: Yard;
  car: Car;
  vehicle: Vehicle;
  spec: VehicleSpec;
  /** Per plot: the game's name, the name of the one coming there, or null for a shut building with nothing named yet. */
  names: (string | null)[];
  /** Per plot: the game's icon once it has decoded. */
  icons: (HTMLImageElement | null)[];
  /** The plot of the game played last, whose door glows. */
  last: number | null;
  at_door: number | null;
  on_pad: boolean;
  /** `fade` runs from 1 at the touch down to 0. */
  contact: { at: Vec; fade: number } | null;
  layer: StaticLayer;
}

export interface YardExtras {
  guides: boolean;
  sensors: Record<End, number | null>;
  time: number;
  font: string;
}

/**
 * The town that doesn't move (ground, buildings, houses, props), drawn once into a canvas a margin bigger than the
 * view and copied each frame; it's drawn again when the view leaves it or the zoom, theme or font changes.
 */
export class StaticLayer {
  private canvas: HTMLCanvasElement | null = null;
  private key = "";
  private palette: Palette | null = null;
  private area: Bounds = { x0: 0, y0: 0, x1: 0, y1: 0 };
  private last_scale = 0;

  draw(ctx: CanvasRenderingContext2D, view: View, palette: Palette, key: string, limits: Bounds, paint: (layer: CanvasRenderingContext2D) => void) {
    const { scale, dpr, width, height } = view;
    const half_w = width / 2 / scale;
    const half_h = height / 2 / scale;
    const seen = {
      x0: Math.max(limits.x0, view.x - half_w),
      y0: Math.max(limits.y0, view.y - half_h),
      x1: Math.min(limits.x1, view.x + half_w),
      y1: Math.min(limits.y1, view.y + half_h),
    };
    if (seen.x0 >= seen.x1 || seen.y0 >= seen.y1) return;
    const full_key = `${scale}|${dpr}|${key}`;
    const { area } = this;
    const fits = this.canvas && this.palette === palette && this.key === full_key && seen.x0 >= area.x0 && seen.y0 >= area.y0 && seen.x1 <= area.x1 && seen.y1 <= area.y1;
    const zooming = scale !== this.last_scale;
    this.last_scale = scale;
    // Mid-zoom (an ease or a pinch) a cache would be redrawn every frame anyway, so paint straight to the board.
    if (!fits && zooming) {
      ctx.save();
      ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * (width / 2 - view.x * scale), dpr * (height / 2 - view.y * scale));
      paint(ctx);
      ctx.restore();
      return;
    }
    if (!fits) {
      this.area = {
        x0: Math.max(limits.x0, seen.x0 - half_w * 0.5),
        y0: Math.max(limits.y0, seen.y0 - half_h * 0.5),
        x1: Math.min(limits.x1, seen.x1 + half_w * 0.5),
        y1: Math.min(limits.y1, seen.y1 + half_h * 0.5),
      };
      this.key = full_key;
      this.palette = palette;
      this.canvas ??= document.createElement("canvas");
      this.canvas.width = Math.ceil((this.area.x1 - this.area.x0) * scale * dpr);
      this.canvas.height = Math.ceil((this.area.y1 - this.area.y0) * scale * dpr);
      const layer = this.canvas.getContext("2d");
      if (!layer) return;
      layer.setTransform(dpr * scale, 0, 0, dpr * scale, -this.area.x0 * scale * dpr, -this.area.y0 * scale * dpr);
      paint(layer);
    }
    if (!this.canvas) return;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Whole device pixels: a fractional offset would resample the whole town and soften its hairlines as the view moves.
    ctx.drawImage(
      this.canvas,
      Math.round(dpr * (width / 2 + (this.area.x0 - view.x) * scale)),
      Math.round(dpr * (height / 2 + (this.area.y0 - view.y) * scale))
    );
    ctx.restore();
  }
}

function to_screen(at: Vec, view: View): Vec {
  return { x: view.width / 2 + (at.x - view.x) * view.scale, y: view.height / 2 + (at.y - view.y) * view.scale };
}

function screen_text(ctx: CanvasRenderingContext2D, view: View, font: string) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.font = font;
  ctx.textBaseline = "middle";
}

function plot_centre(plot: Plot): Vec {
  const box = bounds_of(plot.shape);
  const depth = Math.abs(Math.sin(plot.facing)) > 0.5 ? box.y1 - box.y0 : box.x1 - box.x0;
  return to_town(plot, 0, -(depth + RECESS) / 2);
}

// Far out a name on each roof, one size for all so the longest fits a building and neighbours never touch; close in a
// lit sign in the doorway at a fixed size, so the building is named however near the camera is.
function roof_size(ctx: CanvasRenderingContext2D, scene: YardScene, view: View, font: string): number {
  const base = Math.max(9, Math.min(30, view.scale * 1.9));
  ctx.save();
  screen_text(ctx, view, `700 ${base}px ${font}`);
  const widest = Math.max(...scene.names.map((name) => ctx.measureText(name ?? SOON).width + base * 1.45));
  ctx.restore();
  return Math.min(base, (base * ROOF_ROOM * view.scale) / widest);
}

function sign(ctx: CanvasRenderingContext2D, scene: YardScene, index: number, view: View, palette: Palette, font: string, roof: number) {
  const plot = scene.yard.plots[index];
  const icon = plot.open ? scene.icons[index] : null;
  const name = scene.names[index] ?? SOON;
  const close = view.scale >= CLOSE;
  const size = close ? Math.max(12, Math.min(15, view.scale * 0.5)) : roof;
  ctx.save();
  screen_text(ctx, view, `700 ${size}px ${font}`);
  const width = ctx.measureText(name).width + (icon ? size * 1.45 : 0);
  const centre = to_screen(close ? to_town(plot, 0, -RECESS / 2) : plot_centre(plot), view);
  const shut = !plot.open && scene.names[index] !== null;
  // Too far out for a name that won't run into the next roof's: the icon alone, still the building's own.
  if (!close && size < 8) {
    if (icon && icon.complete && icon.naturalWidth) {
      const side = Math.max(10, Math.min(16, view.scale * 3));
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, side * 0.75, 0, Math.PI * 2);
      ctx.fillStyle = palette.void;
      ctx.globalAlpha = 0.75;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.drawImage(icon, centre.x - side / 2, centre.y - side / 2, side, side);
    }
    ctx.restore();
    return;
  }
  const x0 = centre.x - width / 2;
  if (close) {
    const pad = size * 0.5;
    ctx.beginPath();
    ctx.roundRect(x0 - pad, centre.y - size * 0.95, width + pad * 2, size * 1.9, size * 0.5);
    ctx.fillStyle = palette.void;
    ctx.globalAlpha = 0.86;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = plot.open ? palette.target : palette.faint;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  if (icon && icon.complete && icon.naturalWidth) {
    const side = size * 1.15;
    ctx.drawImage(icon, x0, centre.y - side / 2, side, side);
  }
  ctx.textAlign = "left";
  const x = x0 + (icon ? size * 1.45 : 0);
  if (!close) {
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(2, size * 0.22);
    ctx.strokeStyle = palette.void;
    ctx.globalAlpha = 0.75;
    ctx.strokeText(name, x, centre.y);
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = plot.open ? palette.paint : palette.faint;
  ctx.fillText(name, x, centre.y);
  if (shut) {
    ctx.font = `600 ${size * 0.62}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(SOON, centre.x, centre.y + size * 1.05);
  }
  ctx.restore();
}

// The light inside a doorway spills out over its apron, so an open building shows where to drive in.
function doorway(ctx: CanvasRenderingContext2D, scene: YardScene, index: number, scale: number, pulse: number, palette: Palette) {
  const plot = scene.yard.plots[index];
  const active = scene.at_door === index;
  const glow = active || scene.last === index;
  in_plan(ctx, plot, () => {
    const light = ctx.createLinearGradient(0, -RECESS, 0, 4);
    light.addColorStop(0, palette.target);
    light.addColorStop(1, palette.glow_clear);
    ctx.globalAlpha = glow ? 0.5 + 0.2 * pulse : 0.3;
    ctx.fillStyle = light;
    ctx.fillRect(-3, -RECESS, 6, RECESS + 4);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.target;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(0.25, 4 / scale);
    ctx.beginPath();
    ctx.moveTo(-2.4, -RECESS + 0.15);
    ctx.lineTo(2.4, -RECESS + 0.15);
    ctx.stroke();
    ctx.globalAlpha = glow ? 0.7 + 0.3 * pulse : 1;
    ctx.strokeStyle = glow ? palette.target : palette.free;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.12, 2 / scale);
    ctx.setLineDash(active ? [] : [0.6, 0.4]);
    ctx.strokeRect(-3, -RECESS, 6, RECESS + 4);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });
}

// Drawn bigger than they are when the view is far out (a cone the size of a pixel is no slalom), but never into each other.
function cones(ctx: CanvasRenderingContext2D, at: Vec[], scale: number, palette: Palette) {
  const r = Math.max(0.34, Math.min(1, 6.5 / scale));
  const line = Math.max(0.05, 1.25 / scale);
  for (const cone of at) {
    ctx.beginPath();
    ctx.roundRect(cone.x - r + r * 0.25, cone.y - r + r * 0.35, r * 2, r * 2, r * 0.35);
    ctx.fillStyle = palette.shadow;
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(cone.x - r, cone.y - r, r * 2, r * 2, r * 0.35);
    ctx.fillStyle = palette.warning;
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cone.x, cone.y, r * 0.78, 0, Math.PI * 2);
    ctx.fillStyle = palette.warning;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cone.x, cone.y, r * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = palette.glow;
    ctx.lineWidth = r * 0.2;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cone.x, cone.y, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = palette.glow;
    ctx.fill();
  }
}

// The ground tells the districts apart: grass round the sport grounds, hatching on the industrial yard, planks on the quay.
function districts(ctx: CanvasRenderingContext2D, yard: Yard, scale: number, palette: Palette) {
  const line = Math.max(0.05, 1 / scale);
  for (const { district, area } of yard.districts) {
    const { x0, y0, x1, y1 } = area;
    if (district === District.SPORT) {
      ctx.fillStyle = palette.grass;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    } else if (district === District.INDUSTRIAL) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, x1 - x0, y1 - y0);
      ctx.clip();
      ctx.strokeStyle = palette.warning;
      ctx.globalAlpha = 0.18;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let d = x0 - (y1 - y0); d < x1; d += 2.2) {
        ctx.moveTo(d, y1);
        ctx.lineTo(d + (y1 - y0), y0);
      }
      ctx.stroke();
      ctx.restore();
    } else if (district === District.WATERFRONT) {
      ctx.fillStyle = palette.wood;
      ctx.globalAlpha = 0.18;
      ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
      ctx.globalAlpha = 0.3;
      ctx.strokeStyle = palette.wood;
      ctx.lineWidth = line;
      ctx.beginPath();
      for (let x = x0 + 1.2; x < x1; x += 1.2) {
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  const r = Math.max(0.22, Math.min(0.5, 4 / scale));
  for (let x = 2; x < yard.bounds.x1 - 1; x += 6) {
    ctx.beginPath();
    ctx.arc(x, yard.quay - 0.6, r, 0, Math.PI * 2);
    ctx.fillStyle = palette.pillar;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = Math.max(0.04, 1 / scale);
    ctx.stroke();
  }
}

function plaza(ctx: CanvasRenderingContext2D, yard: Yard, scale: number, palette: Palette) {
  const { plaza: square } = yard;
  const centre = { x: (square.x0 + square.x1) / 2, y: (square.y0 + square.y1) / 2 };
  ctx.save();
  ctx.beginPath();
  ctx.rect(square.x0, square.y0, square.x1 - square.x0, square.y1 - square.y0);
  ctx.clip();
  ctx.strokeStyle = palette.faint;
  ctx.globalAlpha = 0.3;
  ctx.lineWidth = Math.max(0.05, 1 / scale);
  ctx.beginPath();
  for (let r = 9; r < 30; r += 2.5) {
    ctx.moveTo(centre.x + r, centre.y);
    ctx.arc(centre.x, centre.y, r, 0, Math.PI * 2);
  }
  ctx.stroke();
  ctx.restore();
  ctx.strokeStyle = palette.kerb;
  ctx.lineWidth = Math.max(0.15, 3 / scale);
  ctx.strokeRect(square.x0, square.y0, square.x1 - square.x0, square.y1 - square.y0);
  path(ctx, yard.pad);
  ctx.fillStyle = palette.asphalt;
  ctx.fill();
}

function town(ctx: CanvasRenderingContext2D, yard: Yard, scale: number, palette: Palette, font: string) {
  ground(ctx, yard.surfaces, yard.marks, scale, palette);
  districts(ctx, yard, scale, palette);
  plaza(ctx, yard, scale, palette);
  solids(ctx, yard.props, scale, palette);
  ctx.fillStyle = palette.shadow;
  for (const shape of [...yard.plots.flatMap(shadow_of), ...yard.houses.map((each) => each.shape)]) {
    ctx.beginPath();
    shape.forEach((p, i) => (i ? ctx.lineTo(p.x + 0.45, p.y + 0.6) : ctx.moveTo(p.x + 0.45, p.y + 0.6)));
    ctx.closePath();
    ctx.fill();
  }
  for (const each of yard.houses) house(ctx, each, scale, palette);
  for (const at of yard.trees) tree(ctx, at, scale, palette);
  for (const plot of yard.plots) building(ctx, plot, scale, palette);
  cones(ctx, yard.cones, scale, palette);
  const box = bounds_of(yard.pad);
  const size = Math.max(10, Math.min(15, scale * 0.9));
  // Far out a 1.4 m drop is less than the text's own height, so the name would sit on the pad's edge.
  const drop = Math.max(1.4, (size * 0.5 + 5) / scale);
  label(ctx, { x: (box.x0 + box.x1) / 2, y: box.y0 + drop }, "Garage", size, palette.paint, font, scale);
}

function label(ctx: CanvasRenderingContext2D, at: Vec, text: string, size: number, colour: string, font: string, scale: number) {
  ctx.save();
  ctx.translate(at.x, at.y);
  ctx.scale(1 / scale, 1 / scale);
  ctx.font = `600 ${size}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = colour;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}

function pad(ctx: CanvasRenderingContext2D, scene: YardScene, scale: number, pulse: number, palette: Palette) {
  path(ctx, scene.yard.pad);
  ctx.strokeStyle = scene.on_pad ? palette.target : palette.paint;
  ctx.globalAlpha = scene.on_pad ? 0.7 + 0.3 * pulse : 1;
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(0.15, 2.5 / scale);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function draw_yard(ctx: CanvasRenderingContext2D, scene: YardScene, view: View, palette: Palette, extras: YardExtras) {
  const { scale } = view;
  const { yard, car, spec } = scene;
  begin_frame(ctx, view, palette);
  scene.layer.draw(ctx, view, palette, extras.font, yard.bounds, (layer) => town(layer, yard, scale, palette, extras.font));
  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  pad(ctx, scene, scale, pulse, palette);
  yard.plots.forEach((plot, index) => {
    if (plot.open) doorway(ctx, scene, index, scale, pulse, palette);
  });
  if (palette.beams) beams(ctx, car, spec, palette);
  const roof = roof_size(ctx, scene, view, extras.font);
  yard.plots.forEach((_, index) => sign(ctx, scene, index, view, palette, extras.font, roof));

  if (extras.guides && car.gear !== Gear.PARK) guides(ctx, car, spec, scale, palette);
  player(ctx, car, scene.vehicle, spec, car.brake > 0.05 && car.gear !== Gear.PARK, scale, palette, extras.time);
  sensor_arcs(ctx, car, spec, extras.sensors, scale, palette);

  if (scene.contact && scene.contact.fade > 0) {
    ctx.globalAlpha = scene.contact.fade;
    contact_rings(ctx, scene.contact.at, pulse, scale, palette);
    ctx.globalAlpha = 1;
  }
}
