import type { Polygon, Vec } from "../core/geometry";
import {
  beams,
  begin_frame,
  contact_rings,
  ground,
  guides,
  outlined,
  path,
  player,
  sensor_arcs,
  solids,
  type Palette,
  type View,
} from "../core/draw";
import type { End } from "../core/sensors";
import { Gear, type Car, type Vehicle, type VehicleSpec } from "../core/vehicle";
import { Building } from "../games/define";
import type { Plot, Yard } from "./yard";

const SOON = "Soon";

export interface YardScene {
  yard: Yard;
  car: Car;
  vehicle: Vehicle;
  spec: VehicleSpec;
  /** Per plot: the game's name, the name of the one coming there, or null for a shut building with nothing named yet. */
  names: (string | null)[];
  /** Per plot: the game's icon once it has decoded. */
  icons: (HTMLImageElement | null)[];
  buildings: (Building | null)[];
  /** The plot of the game played last, whose door glows. */
  last: number | null;
  at_door: number | null;
  on_pad: boolean;
  /** `fade` runs from 1 at the touch down to 0. */
  contact: { at: Vec; fade: number } | null;
}

export interface YardExtras {
  guides: boolean;
  sensors: Record<End, number | null>;
  time: number;
  font: string;
}

function to_screen(at: Vec, view: View): Vec {
  return { x: view.width / 2 + (at.x - view.x) * view.scale, y: view.height / 2 + (at.y - view.y) * view.scale };
}

function screen_text(ctx: CanvasRenderingContext2D, view: View, font: string) {
  ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  ctx.font = font;
  ctx.textBaseline = "middle";
}

function label(ctx: CanvasRenderingContext2D, at: Vec, text: string, view: View, size: number, colour: string, font: string) {
  const { x, y } = to_screen(at, view);
  ctx.save();
  screen_text(ctx, view, `600 ${size}px ${font}`);
  ctx.textAlign = "center";
  ctx.fillStyle = colour;
  ctx.fillText(text, x, y);
  ctx.restore();
}

const extent = (shape: Polygon, axis: "x" | "y") => ({
  min: Math.min(...shape.map((p) => p[axis])),
  max: Math.max(...shape.map((p) => p[axis])),
});

// Sized to the building rather than the screen, like a name painted on its roof, so it reads from across the yard.
function sign(ctx: CanvasRenderingContext2D, scene: YardScene, index: number, view: View, palette: Palette, font: string) {
  const plot = scene.yard.plots[index];
  const across = extent(plot.shape, "x");
  const depth = extent(plot.shape, "y");
  const recess = extent(plot.recess, "y");
  const roof = plot.facing > 0 ? { min: depth.min, max: recess.min } : { min: recess.max, max: depth.max };
  const centre = to_screen({ x: plot.mouth.x, y: (roof.min + roof.max) / 2 }, view);
  const room = (across.max - across.min) * view.scale * 0.86;
  const icon = plot.open ? scene.icons[index] : null;
  const name = scene.names[index] ?? SOON;
  const subtitle = !plot.open && scene.names[index] !== null;
  let size = Math.max(13, Math.min(44, view.scale * 2.2));
  ctx.save();
  screen_text(ctx, view, `700 ${size}px ${font}`);
  const measure = () => ctx.measureText(name).width + (icon ? size * 1.5 : 0);
  const wide = measure();
  if (wide > room) {
    size = Math.max(8, size * (room / wide));
    ctx.font = `700 ${size}px ${font}`;
  }
  const width = measure();
  const sub = subtitle ? size * 0.62 : 0;
  const y = centre.y - sub * 0.6;
  let x = centre.x - width / 2;
  if (icon && icon.complete && icon.naturalWidth) {
    const box = size * 1.2;
    ctx.drawImage(icon, x, y - box / 2, box, box);
  }
  if (icon) x += size * 1.5;
  ctx.textAlign = "left";
  ctx.fillStyle = plot.open ? palette.paint : palette.faint;
  ctx.fillText(name, x, y);
  if (subtitle) {
    ctx.font = `600 ${sub}px ${font}`;
    ctx.textAlign = "center";
    ctx.fillText(SOON, centre.x, y + size * 0.62 + sub * 0.5);
  }
  ctx.restore();
}

interface Local {
  plot: Plot;
  x0: number;
  x1: number;
  top: number;
  front: number;
}

// Buildings are drawn as if on the north side, doorway facing south; one on the south side is drawn through a mirror
// across the street, so every roof and doorway is written once.
function upright(ctx: CanvasRenderingContext2D, scene: YardScene, index: number, draw: (local: Local) => void) {
  const plot = scene.yard.plots[index];
  const { y0, y1 } = scene.yard.bounds;
  const south = plot.facing < 0;
  const flip = (p: Vec) => (south ? { x: p.x, y: y0 + y1 - p.y } : p);
  const local = {
    ...plot,
    shape: plot.shape.map(flip),
    door: plot.door.map(flip),
    recess: plot.recess.map(flip),
    mouth: flip(plot.mouth),
  };
  const across = extent(local.shape, "x");
  ctx.save();
  if (south) {
    ctx.translate(0, y0 + y1);
    ctx.scale(1, -1);
  }
  draw({ plot: local, x0: across.min, x1: across.max, top: extent(local.shape, "y").min, front: local.mouth.y });
  ctx.restore();
}

// The light inside a doorway spills out over its apron, so an open building shows where to drive in.
function doorway(ctx: CanvasRenderingContext2D, scene: YardScene, index: number, scale: number, pulse: number, palette: Palette) {
  const active = scene.at_door === index;
  const glow = active || scene.last === index;
  upright(ctx, scene, index, ({ plot }) => {
    const back = extent(plot.recess, "y").min;
    const light = ctx.createLinearGradient(0, back, 0, extent(plot.door, "y").max);
    light.addColorStop(0, palette.target);
    light.addColorStop(1, palette.glow_clear);
    ctx.globalAlpha = glow ? 0.5 + 0.2 * pulse : 0.36;
    path(ctx, plot.door);
    ctx.fillStyle = light;
    ctx.fill();
    ctx.globalAlpha = 1;
    const side = extent(plot.recess, "x");
    ctx.strokeStyle = palette.target;
    ctx.lineCap = "round";
    ctx.lineWidth = Math.max(0.3, 4 / scale);
    ctx.beginPath();
    ctx.moveTo(side.min + 0.6, back + 0.15);
    ctx.lineTo(side.max - 0.6, back + 0.15);
    ctx.stroke();
    ctx.globalAlpha = glow ? 0.7 + 0.3 * pulse : 1;
    path(ctx, plot.door);
    ctx.strokeStyle = glow ? palette.target : palette.free;
    ctx.lineJoin = "round";
    ctx.lineWidth = Math.max(0.12, 2 / scale);
    ctx.setLineDash(active ? [] : [0.6, 0.4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  });
}

function shutter(ctx: CanvasRenderingContext2D, { plot }: Local, scale: number, palette: Palette) {
  const { mouth } = plot;
  ctx.strokeStyle = palette.wall_edge;
  ctx.lineWidth = Math.max(0.06, 1 / scale);
  ctx.beginPath();
  for (let y = mouth.y - 4.6; y < mouth.y; y += 0.5) {
    ctx.moveTo(mouth.x - 2.9, y);
    ctx.lineTo(mouth.x + 2.9, y);
  }
  ctx.stroke();
}

const WING_TOP = 5.4;
const WING_BOTTOM = 10.8;
const DOOR_CLEAR = 3.4;

function wings(local: Local): { x0: number; x1: number }[] {
  const mid = local.plot.mouth.x;
  return [
    { x0: local.x0 + 0.6, x1: mid - DOOR_CLEAR },
    { x0: mid + DOOR_CLEAR, x1: local.x1 - 0.6 },
  ];
}

// A car park reads from above by the bays painted on its roof deck.
function roof_bays(ctx: CanvasRenderingContext2D, local: Local, scale: number, palette: Palette) {
  const { x0, x1, top, plot } = local;
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.08, 1.25 / scale);
  ctx.beginPath();
  for (let x = x0 + 1; x <= x1 - 1 + 1e-9; x += 2.5) {
    if (Math.abs(x - plot.mouth.x) < 3.6) continue;
    ctx.moveTo(x, top + 5.2);
    ctx.lineTo(x, top + 10.4);
  }
  ctx.stroke();
}

// A warehouse reads from above by its ribbed roof and a row of skylights either side of the sign.
function roof_ribs(ctx: CanvasRenderingContext2D, local: Local, scale: number, palette: Palette) {
  const { x0, x1, top, plot } = local;
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.05, 1 / scale);
  ctx.beginPath();
  for (let x = x0 + 0.6; x < x1 - 0.3; x += 0.6) {
    if (Math.abs(x - plot.mouth.x) < 3.3) continue;
    ctx.moveTo(x, top + 5.6);
    ctx.lineTo(x, top + 10.8);
  }
  ctx.stroke();
  ctx.fillStyle = palette.faint;
  ctx.globalAlpha = 0.5;
  for (const x of [x0 + 1.2, x1 - 3.2]) ctx.fillRect(x, top + 6.6, 2, 3.2);
  ctx.globalAlpha = 1;
}

function awning(ctx: CanvasRenderingContext2D, local: Local, scale: number, palette: Palette) {
  const { top } = local;
  ctx.fillStyle = palette.faint;
  ctx.globalAlpha = 0.55;
  for (const wing of wings(local)) {
    for (let x = wing.x0; x + 0.6 <= wing.x1 + 1e-9; x += 1.2) ctx.fillRect(x, top + WING_TOP, 0.6, WING_BOTTOM - WING_TOP);
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.06, 1 / scale);
  for (const wing of wings(local)) ctx.strokeRect(wing.x0, top + WING_TOP, wing.x1 - wing.x0, WING_BOTTOM - WING_TOP);
}

function apron(ctx: CanvasRenderingContext2D, local: Local, scale: number, palette: Palette) {
  const { top } = local;
  const [left, right] = wings(local);
  const cy = top + (WING_TOP + WING_BOTTOM) / 2;
  const r = Math.min((left.x1 - left.x0) / 2, (WING_BOTTOM - WING_TOP) / 2) - 0.2;
  const cx = (left.x0 + left.x1) / 2;
  ctx.lineWidth = Math.max(0.06, 1.25 / scale);
  ctx.strokeStyle = palette.faint;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + r * Math.cos(-0.7), cy + r * Math.sin(-0.7));
  ctx.stroke();
  ctx.beginPath();
  for (let y = top + WING_TOP + 0.4; y < top + WING_BOTTOM; y += 1.2) {
    ctx.moveTo(right.x0, y);
    ctx.lineTo(right.x1, y);
  }
  ctx.setLineDash([0.8, 0.5]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function waves(ctx: CanvasRenderingContext2D, local: Local, scale: number, palette: Palette) {
  const { top } = local;
  ctx.strokeStyle = palette.water_edge;
  ctx.lineWidth = Math.max(0.08, 1.5 / scale);
  ctx.lineCap = "round";
  ctx.beginPath();
  for (const wing of wings(local)) {
    for (let y = top + WING_TOP + 0.8; y < top + WING_BOTTOM; y += 1.6) {
      ctx.moveTo(wing.x0, y);
      for (let x = wing.x0; x + 1 <= wing.x1 + 1e-9; x += 1) ctx.quadraticCurveTo(x + 0.5, y + ((x - wing.x0) % 2 < 1 ? -0.45 : 0.45), x + 1, y);
    }
  }
  ctx.stroke();
}

function shrubs(ctx: CanvasRenderingContext2D, local: Local, scale: number, palette: Palette) {
  const { top } = local;
  ctx.lineWidth = Math.max(0.05, 1 / scale);
  for (const wing of wings(local)) {
    for (let row = 0, y = top + WING_TOP + 0.9; y < top + WING_BOTTOM - 0.5; row++, y += 1.7) {
      for (let x = wing.x0 + 0.8 + (row % 2) * 0.85; x < wing.x1 - 0.5; x += 1.7) {
        ctx.beginPath();
        ctx.arc(x, y, 0.65, 0, Math.PI * 2);
        ctx.fillStyle = palette.hedge;
        ctx.fill();
        ctx.strokeStyle = palette.hedge_edge;
        ctx.stroke();
      }
    }
  }
}

function stands(ctx: CanvasRenderingContext2D, local: Local, scale: number, palette: Palette) {
  const { top } = local;
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.06, 1 / scale);
  ctx.beginPath();
  for (const wing of wings(local)) {
    for (let y = top + WING_TOP + 0.3; y < top + WING_BOTTOM; y += 1.1) {
      ctx.moveTo(wing.x0, y);
      ctx.lineTo(wing.x1, y);
    }
  }
  ctx.stroke();
  ctx.fillStyle = palette.faint;
  for (const wing of wings(local)) {
    for (let y = top + WING_TOP + 0.85; y < top + WING_BOTTOM; y += 1.1) {
      for (let x = wing.x0 + 0.3; x < wing.x1; x += 0.7) ctx.fillRect(x - 0.15, y - 0.15, 0.3, 0.3);
    }
  }
}

function chequers(ctx: CanvasRenderingContext2D, local: Local, palette: Palette) {
  const { top } = local;
  const square = 0.8;
  const y0 = top + (WING_TOP + WING_BOTTOM) / 2 - square;
  ctx.fillStyle = palette.faint;
  for (const wing of wings(local)) {
    for (let i = 0, x = wing.x0; x + square <= wing.x1 + 1e-9; i++, x += square) {
      ctx.fillRect(x, y0 + (i % 2) * square, square, square);
    }
  }
}

// A test centre's roof is painted like the road it examines: a dashed centre line and a zebra on each wing.
function crossing(ctx: CanvasRenderingContext2D, local: Local, scale: number, palette: Palette) {
  const { top } = local;
  const y = top + (WING_TOP + WING_BOTTOM) / 2;
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.12, 1.5 / scale);
  ctx.setLineDash([1, 0.8]);
  ctx.beginPath();
  for (const wing of wings(local)) {
    ctx.moveTo(wing.x0, y);
    ctx.lineTo(wing.x1, y);
  }
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = palette.faint;
  for (const wing of wings(local)) {
    const middle = (wing.x0 + wing.x1) / 2;
    for (let x = middle - 2.1; x < middle + 2; x += 0.9) ctx.fillRect(x, top + WING_TOP + 0.3, 0.45, WING_BOTTOM - WING_TOP - 0.6);
  }
}

// The new games' roofs: a valet stand's striped awning, an apron's radar dome and lead-in lines, a ferry deck's water,
// a garden's shrubs, an arena's tiers of seats, a race track's chequers, a test centre's road markings.
function roof(ctx: CanvasRenderingContext2D, building: Building | null, local: Local, scale: number, palette: Palette) {
  switch (building) {
    case Building.CAR_PARK:
      return roof_bays(ctx, local, scale, palette);
    case Building.WAREHOUSE:
      return roof_ribs(ctx, local, scale, palette);
    case Building.VALET_STAND:
      return awning(ctx, local, scale, palette);
    case Building.APRON:
      return apron(ctx, local, scale, palette);
    case Building.FERRY:
      return waves(ctx, local, scale, palette);
    case Building.GARDEN:
      return shrubs(ctx, local, scale, palette);
    case Building.ARENA:
      return stands(ctx, local, scale, palette);
    case Building.TRACK:
      return chequers(ctx, local, palette);
    case Building.TEST_CENTRE:
      return crossing(ctx, local, scale, palette);
  }
}

function buildings(ctx: CanvasRenderingContext2D, scene: YardScene, scale: number, palette: Palette) {
  outlined(ctx, scene.yard.structures, palette.pavement, palette.wall_edge, 3 / scale);
  scene.yard.plots.forEach((plot, index) =>
    upright(ctx, scene, index, (local) => {
      if (!plot.open) shutter(ctx, local, scale, palette);
      else roof(ctx, scene.buildings[index], local, scale, palette);
    })
  );
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

function bollards(ctx: CanvasRenderingContext2D, at: Vec[], scale: number, palette: Palette) {
  const r = Math.max(0.24, Math.min(0.75, 5.5 / scale));
  const line = Math.max(0.05, 1.25 / scale);
  for (const post of at) {
    ctx.beginPath();
    ctx.arc(post.x + r * 0.25, post.y + r * 0.35, r, 0, Math.PI * 2);
    ctx.fillStyle = palette.shadow;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(post.x, post.y, r, 0, Math.PI * 2);
    ctx.fillStyle = palette.pillar;
    ctx.fill();
    ctx.strokeStyle = palette.ink;
    ctx.lineWidth = line;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(post.x, post.y, r * 0.62, 0, Math.PI * 2);
    ctx.strokeStyle = palette.warning;
    ctx.lineWidth = r * 0.34;
    ctx.stroke();
  }
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
  ground(ctx, yard.surfaces, yard.marks, scale, palette);
  const pulse = 0.5 + 0.5 * Math.sin(extras.time * 3);
  pad(ctx, scene, scale, pulse, palette);
  const top = yard.pad.reduce((min, p) => Math.min(min, p.y), Infinity);
  const mid = yard.pad.reduce((sum, p) => sum + p.x, 0) / yard.pad.length;
  const garage_size = Math.max(10, Math.min(15, scale * 0.9));
  // Far out a 1.4 m drop is less than the text's own height, so the name would sit on the pad's edge.
  const drop = Math.max(1.4, (garage_size * 0.5 + 5) / scale);
  label(ctx, { x: mid, y: top + drop }, "Garage", view, garage_size, palette.paint, extras.font);
  yard.plots.forEach((plot, index) => {
    if (plot.open) doorway(ctx, scene, index, scale, pulse, palette);
  });

  if (palette.beams) beams(ctx, car, spec, palette);
  buildings(ctx, scene, scale, palette);
  solids(ctx, yard.props, scale, palette);
  cones(ctx, yard.cones, scale, palette);
  bollards(ctx, yard.bollards, scale, palette);

  if (extras.guides && car.gear !== Gear.PARK) guides(ctx, car, spec, scale, palette);
  player(ctx, car, scene.vehicle, spec, car.brake > 0.05 && car.gear !== Gear.PARK, scale, palette, extras.time);
  sensor_arcs(ctx, car, spec, extras.sensors, scale, palette);

  if (scene.contact && scene.contact.fade > 0) {
    ctx.globalAlpha = scene.contact.fade;
    contact_rings(ctx, scene.contact.at, pulse, scale, palette);
    ctx.globalAlpha = 1;
  }

  yard.plots.forEach((_, index) => sign(ctx, scene, index, view, palette, extras.font));
}
