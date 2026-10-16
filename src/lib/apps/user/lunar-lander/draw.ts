import { resolve_token } from "$lib/core/utils";
import { WORLD, type GameState } from "./game";
import { ShipId, ThrusterKind, type Point, type ShipDesign } from "./ships";

export interface Palette {
  sky: string;
  ground: string;
  ridge: string;
  pad: string;
  ship: string;
  detail: string;
  flame: string;
}

export function read_palette(probe: HTMLElement): Palette {
  const token = (value: string) => resolve_token(probe, value);
  return {
    sky: token("light-dark(var(--background-lightest), var(--background-darkest))"),
    ground: token("color-mix(in oklch, var(--foreground) 14%, transparent)"),
    ridge: token("color-mix(in oklch, var(--foreground) 45%, transparent)"),
    pad: token("var(--primary)"),
    ship: token("var(--foreground)"),
    detail: token("light-dark(var(--background-lightest), var(--background-darkest))"),
    flame: token("var(--accent)"),
  };
}

function polygon(ctx: CanvasRenderingContext2D, points: readonly Point[]) {
  ctx.beginPath();
  points.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.closePath();
  ctx.fill();
}

function lines(ctx: CanvasRenderingContext2D, segments: readonly [number, number, number, number][]) {
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of segments) {
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
  }
  ctx.stroke();
}

function bell(ctx: CanvasRenderingContext2D, at: Point, dir: Point, width: number, depth: number) {
  const nx = -dir.y;
  const ny = dir.x;
  const throat = { x: at.x + dir.x * depth, y: at.y + dir.y * depth };
  polygon(ctx, [
    { x: throat.x + nx * width * 0.3, y: throat.y + ny * width * 0.3 },
    { x: throat.x - nx * width * 0.3, y: throat.y - ny * width * 0.3 },
    { x: at.x - nx * width * 0.5, y: at.y - ny * width * 0.5 },
    { x: at.x + nx * width * 0.5, y: at.y + ny * width * 0.5 },
  ]);
}

function draw_lander(ctx: CanvasRenderingContext2D, palette: Palette) {
  lines(ctx, [
    [-4, 2, -8, 7],
    [4, 2, 8, 7],
    [-6, 0, -8, 7],
    [6, 0, 8, 7],
    [-9.5, 7, -6.5, 7],
    [6.5, 7, 9.5, 7],
  ]);
  ctx.fillRect(-6, -4, 12, 6);
  polygon(ctx, [
    { x: -4, y: -8 },
    { x: 4, y: -8 },
    { x: 6, y: -4 },
    { x: -6, y: -4 },
  ]);
  ctx.fillRect(-7.5, -6, 1.5, 2);
  ctx.fillRect(6, -6, 1.5, 2);
  bell(ctx, { x: 0, y: 4 }, { x: 0, y: -1 }, 4, 2);
  ctx.fillStyle = palette.detail;
  polygon(ctx, [
    { x: -3, y: -7.2 },
    { x: 3, y: -7.2 },
    { x: 4.2, y: -4.8 },
    { x: -4.2, y: -4.8 },
  ]);
}

function draw_pods(ctx: CanvasRenderingContext2D, palette: Palette) {
  lines(ctx, [
    [-3, 2, -6, 9],
    [3, 2, 6, 9],
    [-7.5, 9, -4.5, 9],
    [4.5, 9, 7.5, 9],
    [-5, -1, -4, -1],
    [4, -1, 5, -1],
  ]);
  polygon(ctx, [
    { x: -3, y: -11 },
    { x: 3, y: -11 },
    { x: 4, y: -5 },
    { x: 4, y: 3 },
    { x: -4, y: 3 },
    { x: -4, y: -5 },
  ]);
  for (const x of [-7, 7]) {
    ctx.beginPath();
    ctx.roundRect(x - 2, -4, 4, 8, 1.5);
    ctx.fill();
    bell(ctx, { x, y: 5 }, { x: 0, y: -1 }, 3, 1.2);
  }
  ctx.fillStyle = palette.detail;
  polygon(ctx, [
    { x: -1.8, y: -9.5 },
    { x: 1.8, y: -9.5 },
    { x: 2.5, y: -6 },
    { x: -2.5, y: -6 },
  ]);
}

function draw_shuttle(ctx: CanvasRenderingContext2D, palette: Palette) {
  lines(ctx, [
    [-22, 5, -22, 9],
    [20, 5, 20, 9],
    [-24, 9, -20, 9],
    [18, 9, 22, 9],
  ]);
  polygon(ctx, [
    { x: -28, y: -5 },
    { x: 18, y: -5 },
    { x: 30, y: 0 },
    { x: 18, y: 5 },
    { x: -28, y: 5 },
  ]);
  for (const y of [-3, 0, 3]) bell(ctx, { x: -30, y }, { x: 1, y: 0 }, 2.4, 2);
  for (const x of [-15, 15]) {
    ctx.beginPath();
    ctx.roundRect(x - 3, -6, 6, 11, 1.5);
    ctx.fill();
    bell(ctx, { x, y: 6 }, { x: 0, y: -1 }, 3, 1);
  }
  ctx.fillStyle = palette.detail;
  polygon(ctx, [
    { x: 21, y: -3 },
    { x: 26, y: -1.2 },
    { x: 21, y: -1.2 },
  ]);
  ctx.strokeStyle = palette.detail;
  ctx.lineWidth = 0.6;
  lines(ctx, [
    [-10, -4, -10, 4],
    [0, -4, 0, 4],
    [10, -4, 10, 4],
    [-10, -4, 10, -4],
  ]);
}

const BODIES: Record<ShipId, (ctx: CanvasRenderingContext2D, palette: Palette) => void> = {
  lander: draw_lander,
  pods: draw_pods,
  shuttle: draw_shuttle,
};

function draw_flames(ctx: CanvasRenderingContext2D, design: ShipDesign, firing: readonly boolean[], palette: Palette, time: number) {
  ctx.fillStyle = palette.flame;
  design.thrusters.forEach((thruster, i) => {
    if (!firing[i]) return;
    const main = thruster.kind === ThrusterKind.MAIN;
    const length = (main ? 9 : 4) * (0.75 + 0.25 * Math.sin(time * 60 + i * 2));
    const half = main ? 1.6 : 0.7;
    const { at, dir } = thruster;
    const nx = -dir.y;
    const ny = dir.x;
    polygon(ctx, [
      { x: at.x + nx * half, y: at.y + ny * half },
      { x: at.x - nx * half, y: at.y - ny * half },
      { x: at.x - dir.x * length, y: at.y - dir.y * length },
    ]);
  });
}

export function draw_scene(
  ctx: CanvasRenderingContext2D,
  game: GameState,
  width: number,
  height: number,
  dpr: number,
  palette: Palette
) {
  const scale = Math.min(width / WORLD.width, height / WORLD.height);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = palette.sky;
  ctx.fillRect(0, 0, width, height);
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);

  ctx.beginPath();
  ctx.moveTo(0, WORLD.height);
  for (const point of game.terrain) ctx.lineTo(point.x, point.y);
  ctx.lineTo(WORLD.width, WORLD.height);
  ctx.closePath();
  ctx.fillStyle = palette.ground;
  ctx.fill();

  ctx.beginPath();
  game.terrain.forEach((point, i) => (i === 0 ? ctx.moveTo(point.x, point.y) : ctx.lineTo(point.x, point.y)));
  ctx.strokeStyle = palette.ridge;
  ctx.lineWidth = 1;
  ctx.lineJoin = "round";
  ctx.stroke();

  ctx.fillStyle = palette.pad;
  ctx.fillRect(game.pad.x0, game.pad.y - 1, game.pad.x1 - game.pad.x0, 3);

  ctx.save();
  ctx.translate(game.ship.x, game.ship.y);
  ctx.rotate(game.ship.angle);
  draw_flames(ctx, game.design, game.firing, palette, game.time);
  ctx.fillStyle = palette.ship;
  ctx.strokeStyle = palette.ship;
  ctx.lineWidth = 1;
  ctx.lineCap = "round";
  BODIES[game.design.id](ctx, palette);
  ctx.restore();
}
