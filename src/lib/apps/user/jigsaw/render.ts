import { resolve_token } from "$lib/core/utils";
import type { View } from "$kit/utils/view";
import type { Board } from "./board";
import { piece_path, tab_margin, type Cuts } from "./cuts";

const MIN_SIDE = 800;
const MAX_SIDE = 1600;

export interface Palette {
  frame: string;
  frame_fill: string;
  edge: string;
  shadow: string;
}

export interface Sprite {
  bitmap: ImageBitmap;
  path: Path2D;
}

export function read_palette(probe: HTMLElement): Palette {
  const token = (value: string) => resolve_token(probe, value);
  return {
    frame: token("color-mix(in oklch, var(--foreground) 22%, transparent)"),
    frame_fill: token("color-mix(in oklch, var(--foreground) 5%, transparent)"),
    edge: token("color-mix(in oklch, var(--background-darkest) 55%, transparent)"),
    shadow: token("color-mix(in oklch, var(--background-darkest) 70%, transparent)"),
  };
}

/** World units are this bitmap's pixels: big photos shrink so hundreds of piece bitmaps stay light, tiny ones grow. */
export async function load_picture(blob: Blob): Promise<ImageBitmap> {
  const original = await createImageBitmap(blob);
  const long = Math.max(original.width, original.height);
  const scale = Math.min(MAX_SIDE, Math.max(MIN_SIDE, long)) / long;
  if (scale === 1) return original;
  const resized = await createImageBitmap(original, {
    resizeWidth: Math.max(1, Math.round(original.width * scale)),
    resizeHeight: Math.max(1, Math.round(original.height * scale)),
    resizeQuality: "high",
  });
  original.close();
  return resized;
}

export function render_pieces(picture: ImageBitmap, cuts: Cuts, edge: string): Sprite[] {
  const { layout } = cuts;
  const margin = tab_margin(layout);
  const width = Math.ceil(layout.piece_width + margin * 2);
  const height = Math.ceil(layout.piece_height + margin * 2);
  const line = Math.max(1, Math.min(layout.piece_width, layout.piece_height) * 0.018);
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d")!;
  const sprites: Sprite[] = [];
  for (let piece = 0; piece < layout.cols * layout.rows; piece++) {
    const path = new Path2D(piece_path(cuts, piece));
    const col = piece % layout.cols;
    const row = Math.floor(piece / layout.cols);
    ctx.save();
    ctx.translate(margin, margin);
    ctx.clip(path);
    ctx.drawImage(picture, -col * layout.piece_width, -row * layout.piece_height);
    ctx.lineWidth = line * 2;
    ctx.strokeStyle = edge;
    ctx.stroke(path);
    ctx.restore();
    sprites.push({ bitmap: canvas.transferToImageBitmap(), path });
  }
  return sprites;
}

export interface Scene {
  board: Board;
  sprites: Sprite[];
  picture: ImageBitmap;
  view: View;
  palette: Palette;
  width: number;
  height: number;
  dpr: number;
  ghost: boolean;
  hidden: Set<number>;
  lifted: Set<number> | null;
}

export function draw(ctx: CanvasRenderingContext2D, scene: Scene): void {
  const { board, sprites, view, palette, dpr } = scene;
  const { layout } = board;
  const margin = tab_margin(layout);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(view.scale * dpr, 0, 0, view.scale * dpr, view.offset_x * dpr, view.offset_y * dpr);

  ctx.fillStyle = palette.frame_fill;
  ctx.fillRect(0, 0, layout.width, layout.height);
  if (scene.ghost) {
    ctx.globalAlpha = 0.28;
    ctx.drawImage(scene.picture, 0, 0);
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = 1.5 / view.scale;
  ctx.strokeStyle = palette.frame;
  ctx.strokeRect(0, 0, layout.width, layout.height);

  const left = -view.offset_x / view.scale - margin;
  const top = -view.offset_y / view.scale - margin;
  const right = left + scene.width / view.scale + margin * 2;
  const bottom = top + scene.height / view.scale + margin * 2;
  const lifted: number[] = [];
  for (const piece of board.order) {
    if (scene.hidden.has(board.sets.find(piece))) continue;
    if (scene.lifted?.has(piece)) {
      lifted.push(piece);
      continue;
    }
    const x = board.x[piece];
    const y = board.y[piece];
    if (x > right || y > bottom || x + layout.piece_width < left || y + layout.piece_height < top) continue;
    ctx.drawImage(sprites[piece].bitmap, x - margin, y - margin);
  }

  if (!lifted.length) return;
  ctx.shadowColor = palette.shadow;
  ctx.shadowBlur = 12 * dpr;
  ctx.shadowOffsetY = 4 * dpr;
  for (const piece of lifted) ctx.drawImage(sprites[piece].bitmap, board.x[piece] - margin, board.y[piece] - margin);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

let probe: OffscreenCanvasRenderingContext2D | null = null;

export function piece_at(board: Board, sprites: Sprite[], hidden: Set<number>, wx: number, wy: number): number | null {
  probe ??= new OffscreenCanvas(1, 1).getContext("2d")!;
  const { layout } = board;
  const margin = tab_margin(layout);
  for (let i = board.order.length - 1; i >= 0; i--) {
    const piece = board.order[i];
    if (hidden.has(board.sets.find(piece))) continue;
    const lx = wx - board.x[piece];
    const ly = wy - board.y[piece];
    if (lx < -margin || ly < -margin || lx > layout.piece_width + margin || ly > layout.piece_height + margin) continue;
    if (probe.isPointInPath(sprites[piece].path, lx, ly)) return piece;
  }
  return null;
}
