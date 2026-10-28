import { PIECE_TOKENS, PIECES } from "$kit/games/tetromino";
import { resolve_token } from "$lib/core/utils";
import { CLEAR_MS, Direction, drop_distance, piece_cells, zones, type GameState, type Piece } from "./game";

export interface Palette {
  board: string;
  well: string;
  seam: string;
  wall: string;
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
    seam: token("color-mix(in oklch, var(--foreground) 10%, transparent)"),
    wall: token("color-mix(in oklch, var(--foreground) 55%, transparent)"),
    flash: token("var(--foreground)"),
    pieces: per_piece((name) => `var(--${name})`),
    ghosts: per_piece((name) => `color-mix(in oklch, var(--${name}) 30%, transparent)`),
  };
}

export function draw_field(ctx: CanvasRenderingContext2D, game: GameState, width: number, dpr: number, palette: Palette) {
  const size = game.size;
  const cell = width / size;
  // A gap around every cell keeps neighbouring pieces apart (brand: two brand colours never touch).
  const gap = Math.max(1, cell * 0.06);
  const radius = Math.max(1, cell * 0.16);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, width);
  ctx.fillStyle = palette.board;
  ctx.fillRect(0, 0, width, width);

  ctx.strokeStyle = palette.seam;
  ctx.lineWidth = Math.max(1, gap);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(width, width);
  ctx.moveTo(width, 0);
  ctx.lineTo(0, width);
  ctx.stroke();

  const block = (index: number, color: string) => {
    const x = index % size;
    const y = Math.floor(index / size);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x * cell + gap, y * cell + gap, cell - gap * 2, cell - gap * 2, radius);
    ctx.fill();
  };

  ctx.fillStyle = palette.well;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) ctx.fillRect(x * cell + cell / 2 - gap, y * cell + cell / 2 - gap, gap * 2, gap * 2);
  }

  const { rows } = zones(size);
  const flashing = new Set(game.clearing?.lines.flatMap((line) => rows[line.zone][line.depth]));
  game.board.forEach((piece, index) => {
    if (piece && !flashing.has(index)) block(index, palette.pieces[piece]);
  });

  if (game.clearing && flashing.size > 0) {
    ctx.globalAlpha = Math.max(0, Math.min(1, game.clearing.ms / CLEAR_MS));
    for (const index of flashing) block(index, palette.flash);
    ctx.globalAlpha = 1;
  }

  const active = game.active;
  if (!active) return;

  const bar = Math.max(1.5, gap);
  ctx.fillStyle = palette.wall;
  const walls: Record<Direction, [number, number, number, number]> = {
    down: [0, width - bar, width, bar],
    up: [0, 0, width, bar],
    left: [0, 0, bar, width],
    right: [width - bar, 0, bar, width],
  };
  ctx.fillRect(...walls[active.direction]);

  const drop = drop_distance(game, active);
  if (drop > 0) {
    for (const { x, y } of piece_cells(size, { ...active, y: active.y + drop })) block(y * size + x, palette.ghosts[active.piece]);
  }
  for (const { x, y } of piece_cells(size, active)) block(y * size + x, palette.pieces[active.piece]);
}
