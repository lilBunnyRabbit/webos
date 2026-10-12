import type { GameState } from "./game";

export interface Palette {
  board: string;
  grid: string;
  snake: string;
  head: string;
  food: string;
}

/** Resolved through `probe`'s computed colour, since a token may itself be written with `var()` or relative colour syntax. */
export function read_palette(probe: HTMLElement): Palette {
  const token = (value: string) => {
    probe.style.color = value;
    return getComputedStyle(probe).color;
  };
  const palette = {
    board: token("var(--background-darker)"),
    grid: token("color-mix(in oklch, var(--foreground) 5%, transparent)"),
    snake: token("color-mix(in oklch, var(--primary) 80%, transparent)"),
    head: token("var(--primary)"),
    food: token("var(--accent)"),
  };
  probe.style.color = "";
  return palette;
}

export function draw_board(ctx: CanvasRenderingContext2D, game: GameState, size: number, dpr: number, palette: Palette) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const cell = size / game.width;
  // A gap around every cell keeps the snake and the food from touching (brand: two brand colours never touch).
  const gap = Math.max(1, cell * 0.08);

  ctx.fillStyle = palette.board;
  ctx.fillRect(0, 0, size, size);

  ctx.fillStyle = palette.grid;
  for (let y = 0; y < game.height; y++) {
    for (let x = y % 2; x < game.width; x += 2) ctx.fillRect(x * cell, y * cell, cell, cell);
  }

  if (game.food) {
    ctx.fillStyle = palette.food;
    ctx.beginPath();
    ctx.arc((game.food.x + 0.5) * cell, (game.food.y + 0.5) * cell, cell / 2 - gap * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const radius = Math.max(1, cell * 0.22);
  game.snake.forEach((point, i) => {
    ctx.fillStyle = i === 0 ? palette.head : palette.snake;
    ctx.beginPath();
    ctx.roundRect(point.x * cell + gap, point.y * cell + gap, cell - gap * 2, cell - gap * 2, radius);
    ctx.fill();
  });
}
