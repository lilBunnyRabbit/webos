import { clamp } from "../../core/geometry";
import { contact_rings, type Palette } from "../../core/draw";
import { bump_flash, SideKind, type GameState, type SideView } from "./game";
import { CLEAN, Fit, ideal_lift, judge, MAST, MISS, POCKET, reach } from "./rack";
import { TIER_HEIGHTS, type Slot } from "./warehouse";

export interface SideCanvas {
  width: number;
  height: number;
  dpr: number;
}

const DEPTH = 1.25;
const UPRIGHT = 0.1;
const BEAM = 0.12;
const OVERHANG = 0.08;
const DECK = 0.144;
const LOAD_HEIGHT = 0.95;
const TINE = 0.045;
const FORK_LENGTH = 1.2;
const PALLET_LENGTH = 1.2;
const SPAN_U = 3.6;
const SPAN_H = 2.4;
const GAUGE = 18;

interface Frame {
  ctx: CanvasRenderingContext2D;
  scale: number;
  palette: Palette;
}

function box(f: Frame, u0: number, h0: number, u1: number, h1: number, fill: string, edge: string | null = null) {
  f.ctx.beginPath();
  f.ctx.rect(u0, h0, u1 - u0, h1 - h0);
  f.ctx.fillStyle = fill;
  f.ctx.fill();
  if (edge) {
    f.ctx.strokeStyle = edge;
    f.ctx.lineWidth = 1 / f.scale;
    f.ctx.stroke();
  }
}

function pallet_side(f: Frame, front: number, base: number, wrapped: boolean) {
  const { palette } = f;
  const back = front + PALLET_LENGTH;
  box(f, front, base + DECK - 0.022, back, base + DECK, palette.wood, palette.ink);
  box(f, front, base, back, base + 0.022, palette.wood, palette.ink);
  for (const u of [front, front + PALLET_LENGTH / 2 - 0.05, back - 0.1]) box(f, u, base + 0.022, u + 0.1, base + DECK - 0.022, palette.wood, palette.ink);
  const top = base + DECK + LOAD_HEIGHT;
  if (wrapped) box(f, front + 0.03, base + DECK, back - 0.03, top, palette.stock, palette.ink);
  else {
    box(f, front + 0.05, base + DECK, front + PALLET_LENGTH / 2, base + DECK + LOAD_HEIGHT / 2, palette.load, palette.load_edge);
    box(f, front + PALLET_LENGTH / 2, base + DECK, back - 0.05, base + DECK + LOAD_HEIGHT / 2, palette.load, palette.load_edge);
    box(f, front + 0.12, base + DECK + LOAD_HEIGHT / 2, back - 0.12, top - 0.1, palette.load, palette.load_edge);
  }
}

function rack(f: Frame, slot: Slot) {
  const { palette } = f;
  const top = TIER_HEIGHTS[slot.tiers - 1] + 1.5;
  box(f, 0, 0, UPRIGHT, top, palette.upright, palette.ink);
  box(f, DEPTH - UPRIGHT, 0, DEPTH, top, palette.upright, palette.ink);
  for (let tier = 1; tier < slot.tiers; tier++) {
    const h = TIER_HEIGHTS[tier];
    for (const u of [-0.02, DEPTH - UPRIGHT - 0.02]) box(f, u, h - BEAM, u + UPRIGHT + 0.04, h, palette.beam, palette.ink);
  }
  for (const u of [-0.02, DEPTH - UPRIGHT - 0.02]) box(f, u, top - BEAM, u + UPRIGHT + 0.04, top, palette.beam, palette.ink);
}

function window_bands(f: Frame, view: SideView, from: number, to: number) {
  const ideal = ideal_lift(view);
  const { ctx, palette } = f;
  ctx.save();
  ctx.globalAlpha = 0.18;
  box(f, from, ideal - MISS, to, ideal + MISS, palette.warning);
  ctx.globalAlpha = 0.3;
  box(f, from, ideal - CLEAN, to, ideal + CLEAN, palette.success);
  ctx.restore();
  ctx.beginPath();
  ctx.moveTo(from, ideal);
  ctx.lineTo(to, ideal);
  ctx.strokeStyle = palette.success;
  ctx.lineWidth = 1.5 / f.scale;
  ctx.setLineDash([6 / f.scale, 4 / f.scale]);
  ctx.stroke();
  ctx.setLineDash([]);
}

function forklift(f: Frame, mast: number, lift: number, load: boolean) {
  const { palette } = f;
  const paint = palette.player.body;
  const outer = 2.2;
  box(f, mast - 2.3, 0.2, mast - 0.18, 1.15, paint, palette.ink);
  box(f, mast - 1.35, 1.15, mast - 1.27, 2.15, palette.steel, palette.ink);
  box(f, mast - 0.32, 1.15, mast - 0.24, 2.15, palette.steel, palette.ink);
  box(f, mast - 1.4, 2.1, mast - 0.2, 2.17, palette.steel, palette.ink);
  for (const u of [mast - 0.55, mast - 1.95]) {
    f.ctx.beginPath();
    f.ctx.arc(u, 0.28, 0.28, 0, Math.PI * 2);
    f.ctx.fillStyle = palette.ink;
    f.ctx.fill();
  }
  box(f, mast - 0.16, 0.05, mast - 0.08, Math.max(outer, lift + 1.1), palette.steel, palette.ink);
  box(f, mast - 0.08, lift, mast, lift + 1.0, palette.steel, palette.ink);
  box(f, mast, lift, mast + FORK_LENGTH, lift + TINE, palette.steel, palette.ink);
  if (load) pallet_side(f, mast + 0.02, lift - POCKET + TINE, false);
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, size: number, colour: string, font: string, align: CanvasTextAlign = "left") {
  ctx.font = `600 ${size}px ${font}`;
  ctx.textAlign = align;
  ctx.textBaseline = "top";
  ctx.fillStyle = colour;
  ctx.fillText(value, x, y);
}

export function draw_side(ctx: CanvasRenderingContext2D, state: GameState, canvas: SideCanvas, palette: Palette, font: string) {
  const view = state.side;
  if (!view) return;
  const { width, height, dpr } = canvas;
  const gauge_room = GAUGE + 12;
  const scale = Math.min((width - gauge_room) / SPAN_U, height / SPAN_H);
  const ideal = ideal_lift(view);
  const into = reach(state, view);
  const tips = -OVERHANG + into - (view.kind === SideKind.DROP ? 0.02 : 0);
  const mast = tips - FORK_LENGTH;
  const focus = clamp(view.lift + 0.45, SPAN_H / 2 - 0.15, MAST + 1 - SPAN_H / 2);
  const centre_u = 0.15 + (mast - (-OVERHANG - FORK_LENGTH)) * 0.5;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = palette.floor;
  ctx.fillRect(0, 0, width * dpr, height * dpr);
  const left = (width - gauge_room) / 2 - centre_u * scale;
  ctx.setTransform(dpr * scale, 0, 0, -dpr * scale, dpr * left, dpr * (height / 2 + focus * scale));
  const f: Frame = { ctx, scale, palette };

  box(f, -10, -2, 10, 0, palette.asphalt);
  rack(f, view.slot);
  const here = (slot: Slot) => slot.name === view.slot.name;
  for (const slot of state.floor.stock) if (here(slot)) pallet_side(f, -OVERHANG, TIER_HEIGHTS[slot.tier], true);
  state.loads.forEach((each, i) => {
    const task = state.floor.tasks[i];
    const at = each.placed ? task.to : task.from;
    if (!each.carried && at.kind === view.slot.kind && here(at)) pallet_side(f, -OVERHANG, TIER_HEIGHTS[each.tier], false);
  });
  window_bands(f, view, Math.min(mast, -1.5), -OVERHANG);
  forklift(f, mast, view.lift, view.kind === SideKind.DROP);
  if (bump_flash(state)) contact_rings(ctx, { x: tips, y: view.lift + TINE }, 0.5 + 0.5 * Math.sin(state.ms * 0.003), scale, palette);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const miss = view.lift - ideal;
  const verdict = judge(miss);
  const tone = verdict === Fit.CLEAN ? palette.success : verdict === Fit.SCRAPE ? palette.warning : palette.error;
  const size = clamp(width / 26, 11, 14);
  const cm = Math.round(miss * 100);
  const pad = 8;
  const off = cm === 0 ? "on the mark" : `${Math.abs(cm)} cm ${cm > 0 ? "high" : "low"}`;
  const first = `Forks ${view.lift.toFixed(2)} m`;
  const second = `${view.kind === SideKind.PICK ? "Pockets" : "Over the beam"} ↑${view.slot.tier}: ${off}`;
  ctx.font = `600 ${size}px ${font}`;
  const wide = Math.max(ctx.measureText(first).width, (ctx.measureText(second).width * 0.9));
  ctx.fillStyle = palette.void;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.roundRect(pad - 5, pad - 4, wide + 12, size * 2.9, 6);
  ctx.fill();
  ctx.globalAlpha = 1;
  text(ctx, first, pad, pad, size, palette.paint, font);
  text(ctx, second, pad, pad + size * 1.4, size * 0.9, tone, font);

  const g0 = width - GAUGE - 6;
  const top = 10;
  const bottom = height - 10;
  const at = (h: number) => bottom - (h / MAST) * (bottom - top);
  ctx.fillStyle = palette.void;
  ctx.globalAlpha = 0.7;
  ctx.fillRect(g0, top, GAUGE, bottom - top);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = palette.beam;
  ctx.lineWidth = 2;
  for (let tier = 1; tier < view.slot.tiers; tier++) {
    ctx.beginPath();
    ctx.moveTo(g0, at(TIER_HEIGHTS[tier]));
    ctx.lineTo(g0 + GAUGE, at(TIER_HEIGHTS[tier]));
    ctx.stroke();
  }
  ctx.fillStyle = palette.success;
  ctx.fillRect(g0, at(ideal + MISS), GAUGE, Math.max(2, at(ideal - MISS) - at(ideal + MISS)));
  ctx.fillStyle = tone;
  ctx.beginPath();
  const y = at(view.lift);
  ctx.moveTo(g0 - 7, y - 5);
  ctx.lineTo(g0, y);
  ctx.lineTo(g0 - 7, y + 5);
  ctx.fill();
  ctx.fillRect(g0, y - 1.5, GAUGE, 3);
}
