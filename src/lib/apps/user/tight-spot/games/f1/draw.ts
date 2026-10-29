import { begin_frame, contact_rings, player, union, type Palette, type View } from "../../core/draw";
import type { Pose, Vec } from "../../core/geometry";
import { body_centre, create_car, Gear, Vehicle } from "../../core/vehicle";
import type { GameState } from "./game";
import { SPEC } from "./spec";
import { racing_line } from "./line";
import { DS, HALF_WIDTH, KERB, type Track } from "./track";

export interface DrawExtras {
  time: number;
  /** The racing line, under the guides setting. */
  guides: boolean;
  ghost: Pose | null;
}

const CONTACT_FADE_MS = 1200;
const STRIPE = 4;

function side_point(track: Track, i: number, offset: number): Vec {
  return { x: track.centre[i].x + track.normal[i].x * offset, y: track.centre[i].y + track.normal[i].y * offset };
}

function kerbs(ctx: CanvasRenderingContext2D, track: Track, palette: Palette) {
  const n = track.centre.length;
  for (const [stripe, colour] of [
    [0, palette.error],
    [1, palette.glow],
  ] as const) {
    const pieces: Vec[][] = [];
    for (let i = 0; i < n; i++) {
      if (!track.kerb[i] || Math.floor(i / STRIPE) % 2 !== stripe) continue;
      const j = (i + 1) % n;
      for (const side of [-1, 1]) {
        const inner = HALF_WIDTH * side;
        const outer = (HALF_WIDTH + KERB) * side;
        pieces.push([side_point(track, i, inner), side_point(track, j, inner), side_point(track, j, outer), side_point(track, i, outer)]);
      }
    }
    union(ctx, pieces);
    ctx.fillStyle = colour;
    ctx.fill();
  }
}

// The asphalt is one ring, both edges in one path filled even-odd, so no seams show between its pieces.
function surface(ctx: CanvasRenderingContext2D, track: Track, palette: Palette) {
  const { bounds } = track;
  ctx.fillStyle = palette.grass;
  ctx.fillRect(bounds.x0, bounds.y0, bounds.x1 - bounds.x0, bounds.y1 - bounds.y0);
  const n = track.centre.length;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    for (let i = 0; i < n; i++) {
      const p = side_point(track, i, HALF_WIDTH * side);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  }
  ctx.fillStyle = palette.asphalt;
  ctx.fill("evenodd");
}

function walls(ctx: CanvasRenderingContext2D, track: Track, palette: Palette) {
  ctx.lineJoin = "round";
  for (const [width, colour] of [
    [1.1, palette.wall_edge],
    [0.75, palette.pillar],
  ] as const) {
    ctx.beginPath();
    for (const line of track.walls) {
      line.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.closePath();
    }
    ctx.strokeStyle = colour;
    ctx.lineWidth = width;
    ctx.stroke();
  }
}

function edge_lines(ctx: CanvasRenderingContext2D, track: Track, scale: number, palette: Palette) {
  const n = track.centre.length;
  ctx.strokeStyle = palette.paint;
  ctx.lineWidth = Math.max(0.15, 1.25 / scale);
  ctx.lineJoin = "round";
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const p = side_point(track, i % n, (HALF_WIDTH - 0.2) * side);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
}

function across(ctx: CanvasRenderingContext2D, track: Track, s: number, draw: (origin: Vec, along: Vec, normal: Vec) => void) {
  const i = Math.round(s / DS) % track.centre.length;
  const heading = track.heading[i];
  draw(track.centre[i], { x: Math.cos(heading), y: Math.sin(heading) }, track.normal[i]);
}

function start_line(ctx: CanvasRenderingContext2D, track: Track, palette: Palette) {
  across(ctx, track, 0, (origin, along, normal) => {
    const cells = 11;
    const size = (HALF_WIDTH * 2) / cells;
    for (let row = 0; row < 2; row++)
      for (let col = 0; col < cells; col++) {
        const a = -HALF_WIDTH + col * size;
        const b = row * size;
        const at = (u: number, v: number): Vec => ({ x: origin.x + normal.x * u + along.x * v, y: origin.y + normal.y * u + along.y * v });
        ctx.beginPath();
        const corners = [at(a, b), at(a + size, b), at(a + size, b + size), at(a, b + size)];
        corners.forEach((p, k) => (k === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        ctx.closePath();
        ctx.fillStyle = (row + col) % 2 === 0 ? palette.ink : palette.glow;
        ctx.fill();
      }
  });
}

function sector_lines(ctx: CanvasRenderingContext2D, track: Track, scale: number, palette: Palette) {
  ctx.strokeStyle = palette.faint;
  ctx.lineWidth = Math.max(0.12, 1.25 / scale);
  ctx.setLineDash([3, 3]);
  for (const s of track.sectors)
    across(ctx, track, s, (origin, _, normal) => {
      ctx.beginPath();
      ctx.moveTo(origin.x - normal.x * HALF_WIDTH, origin.y - normal.y * HALF_WIDTH);
      ctx.lineTo(origin.x + normal.x * HALF_WIDTH, origin.y + normal.y * HALF_WIDTH);
      ctx.stroke();
    });
  ctx.setLineDash([]);
}

function grid_box(ctx: CanvasRenderingContext2D, start: Pose, scale: number, palette: Palette) {
  ctx.save();
  ctx.translate(start.x, start.y);
  ctx.rotate(start.heading);
  ctx.strokeStyle = palette.paint;
  ctx.lineWidth = Math.max(0.15, 1.25 / scale);
  const front = SPEC.length - SPEC.rear_overhang + 0.5;
  const back = -SPEC.rear_overhang - 0.4;
  const half = SPEC.width / 2 + 0.4;
  ctx.beginPath();
  ctx.moveTo(back, -half);
  ctx.lineTo(front, -half);
  ctx.lineTo(front, half);
  ctx.lineTo(back, half);
  ctx.stroke();
  ctx.restore();
}

function line_guide(ctx: CanvasRenderingContext2D, track: Track, scale: number, palette: Palette) {
  const { points } = racing_line(track);
  ctx.strokeStyle = palette.guide;
  ctx.lineWidth = Math.max(0.12, 1.5 / scale);
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
  ctx.stroke();
  ctx.setLineDash([]);
}

// Pulled back for speed the car is a few pixels long, so a ring of fixed screen size marks it, fading in as the view widens.
const MARKER_PX = 12;
const MARKER_FROM = 6;
const MARKER_FULL = 3;

function marker(ctx: CanvasRenderingContext2D, at: Vec, scale: number, palette: Palette) {
  const strength = Math.min(1, Math.max(0, (MARKER_FROM - scale) / (MARKER_FROM - MARKER_FULL)));
  if (strength === 0) return;
  ctx.globalAlpha = strength;
  ctx.beginPath();
  ctx.arc(at.x, at.y, MARKER_PX / scale, 0, Math.PI * 2);
  ctx.fillStyle = palette.target_fill;
  ctx.fill();
  ctx.lineWidth = 2 / scale;
  ctx.strokeStyle = palette.target;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function draw_scene(ctx: CanvasRenderingContext2D, state: GameState, view: View, palette: Palette, extras: DrawExtras) {
  const { scale } = view;
  const { track, car } = state;
  begin_frame(ctx, view, palette);
  surface(ctx, track, palette);
  kerbs(ctx, track, palette);
  edge_lines(ctx, track, scale, palette);
  sector_lines(ctx, track, scale, palette);
  start_line(ctx, track, palette);
  grid_box(ctx, track.start, scale, palette);
  if (extras.guides) line_guide(ctx, track, scale, palette);
  walls(ctx, track, palette);
  if (extras.ghost) {
    ctx.globalAlpha = 0.32;
    player(ctx, create_car(extras.ghost, Gear.DRIVE, SPEC), Vehicle.F1, SPEC, false, scale, palette, extras.time);
    ctx.globalAlpha = 1;
  }
  marker(ctx, body_centre(car, SPEC), scale, palette);
  player(ctx, car, Vehicle.F1, SPEC, car.brake > 0.05, scale, palette, extras.time);
  const contact = state.contact;
  if (contact && state.ms - contact.ms < CONTACT_FADE_MS) {
    ctx.globalAlpha = 1 - (state.ms - contact.ms) / CONTACT_FADE_MS;
    contact_rings(ctx, contact.at, 0.5 + 0.5 * Math.sin(extras.time * 6), scale, palette);
    ctx.globalAlpha = 1;
  }
}
