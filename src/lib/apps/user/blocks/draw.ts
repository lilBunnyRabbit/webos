import { resolve_token } from "$lib/core/utils";
import {
  BUFFER,
  CLEAR_MS,
  drop_distance,
  HEIGHT,
  piece_cells,
  PIECES,
  WIDTH,
  type GameState,
  type Piece,
} from "./game";

export const PIECE_TOKENS: Record<Piece, string> = {
  i: "info",
  o: "warning",
  t: "primary",
  s: "success",
  z: "error",
  j: "secondary",
  l: "accent",
};

export interface Palette {
  board: string;
  well: string;
  flash: string;
  pieces: Record<Piece, string>;
  ghosts: Record<Piece, string>;
}

export function read_palette(probe: HTMLElement): Palette {
  const token = (value: string) => resolve_token(probe, value);
  const per_piece = (value: (name: string) => string) =>
    Object.fromEntries(PIECES.map((piece) => [piece, token(value(PIECE_TOKENS[piece]))])) as Record<Piece, string>;
  return {
    board: token("light-dark(var(--background-lightest), var(--background-darker))"),
    well: token("color-mix(in oklch, var(--foreground) 5%, transparent)"),
    flash: token("var(--foreground)"),
    pieces: per_piece((name) => `var(--${name})`),
    ghosts: per_piece((name) => `color-mix(in oklch, var(--${name}) 30%, transparent)`),
  };
}

export function draw_field(
  ctx: CanvasRenderingContext2D,
  game: GameState,
  width: number,
  dpr: number,
  palette: Palette
) {
  const cell = width / WIDTH;
  const height = cell * HEIGHT;
  // A gap around every cell keeps neighbouring pieces apart (brand: two brand colours never touch).
  const gap = Math.max(1, cell * 0.06);
  const radius = Math.max(1, cell * 0.16);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = palette.board;
  ctx.fillRect(0, 0, width, height);

  const block = (x: number, row: number, color: string) => {
    const y = row - BUFFER;
    if (y < 0) return;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x * cell + gap, y * cell + gap, cell - gap * 2, cell - gap * 2, radius);
    ctx.fill();
  };

  ctx.fillStyle = palette.well;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++)
      ctx.fillRect(x * cell + cell / 2 - gap, y * cell + cell / 2 - gap, gap * 2, gap * 2);
  }

  const flashing = new Set(game.clearing?.rows);
  for (let row = BUFFER; row < BUFFER + HEIGHT; row++) {
    if (flashing.has(row)) continue;
    for (let x = 0; x < WIDTH; x++) {
      const piece = game.board[row * WIDTH + x];
      if (piece) block(x, row, palette.pieces[piece]);
    }
  }

  if (game.clearing && flashing.size > 0) {
    ctx.globalAlpha = Math.max(0, Math.min(1, game.clearing.ms / CLEAR_MS));
    for (const row of flashing) for (let x = 0; x < WIDTH; x++) block(x, row, palette.flash);
    ctx.globalAlpha = 1;
  }

  const active = game.active;
  if (!active) return;
  const drop = drop_distance(game.board, active);
  if (drop > 0) {
    for (const { x, y } of piece_cells({ ...active, y: active.y + drop })) block(x, y, palette.ghosts[active.piece]);
  }
  for (const { x, y } of piece_cells(active)) block(x, y, palette.pieces[active.piece]);
}
