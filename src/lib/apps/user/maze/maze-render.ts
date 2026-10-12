import { is_open, type Maze } from "./maze";

export interface Palette {
  wall: string;
  floor: string;
  uncarved: string;
  head: string;
  marks: string;
  visited: string;
  path: string;
  start: string;
  goal: string;
  player: string;
}

/** Resolved through `probe`'s computed colour, since a token may itself be written with `var()` or relative colour syntax. */
export function read_palette(probe: HTMLElement): Palette {
  const token = (name: string) => {
    probe.style.color = `var(--${name})`;
    return getComputedStyle(probe).color;
  };
  const palette: Palette = {
    wall: token("foreground"),
    floor: token("background-light"),
    uncarved: token("background-darker"),
    head: token("cottontail"),
    marks: token("secondary"),
    visited: token("primary"),
    path: token("primary"),
    start: token("tertiary"),
    goal: token("secondary"),
    player: token("primary"),
  };
  probe.style.color = "";
  return palette;
}

export interface Scene {
  maze: Maze;
  start: number;
  goal: number;
  carving: boolean;
  head: number | null;
  marks: readonly number[] | null;
  visited: Uint8Array | null;
  path: readonly number[] | null;
  trail: Uint8Array | null;
  player: number | null;
}

export interface Layout {
  cell: number;
  x: number;
  y: number;
}

const PADDING = 12;

export function layout_for(maze: Maze, width: number, height: number): Layout {
  const cell = Math.max(
    1,
    Math.floor(Math.min((width - PADDING * 2) / maze.width, (height - PADDING * 2) / maze.height))
  );
  return {
    cell,
    x: Math.round((width - cell * maze.width) / 2),
    y: Math.round((height - cell * maze.height) / 2),
  };
}

export function draw_maze(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dpr: number,
  scene: Scene,
  palette: Palette
): void {
  const { maze } = scene;
  const { cell, x: ox, y: oy } = layout_for(maze, width, height);
  const total = maze.width * maze.height;
  const left = (index: number) => ox + (index % maze.width) * cell;
  const top = (index: number) => oy + Math.floor(index / maze.width) * cell;
  const fill_cell = (index: number, inset = 0) =>
    ctx.fillRect(left(index) + inset, top(index) + inset, cell - inset * 2, cell - inset * 2);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.globalAlpha = 1;

  ctx.fillStyle = scene.carving ? palette.uncarved : palette.floor;
  ctx.fillRect(ox, oy, cell * maze.width, cell * maze.height);
  if (scene.carving) {
    ctx.fillStyle = palette.floor;
    for (let i = 0; i < total; i++) if (maze.open[i]) fill_cell(i);
  }

  ctx.globalAlpha = 0.22;
  if (scene.visited) {
    ctx.fillStyle = palette.visited;
    for (let i = 0; i < total; i++) if (scene.visited[i]) fill_cell(i);
  }
  if (scene.trail) {
    ctx.fillStyle = palette.player;
    for (let i = 0; i < total; i++) if (scene.trail[i]) fill_cell(i);
  }
  if (scene.marks) {
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = palette.marks;
    for (const i of scene.marks) fill_cell(i);
  }

  if (!scene.carving) {
    const inset = Math.max(1, cell * 0.18);
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = palette.start;
    fill_cell(scene.start, inset);
    ctx.fillStyle = palette.goal;
    fill_cell(scene.goal, inset);
  }

  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = palette.wall;
  ctx.lineWidth = Math.max(1, Math.min(4, Math.round(cell * 0.1)));
  ctx.lineCap = "square";
  ctx.beginPath();
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox + cell * maze.width, oy);
  ctx.moveTo(ox, oy);
  ctx.lineTo(ox, oy + cell * maze.height);
  for (let i = 0; i < total; i++) {
    const x = left(i);
    const y = top(i);
    if (!is_open(maze, i, "e")) {
      ctx.moveTo(x + cell, y);
      ctx.lineTo(x + cell, y + cell);
    }
    if (!is_open(maze, i, "s")) {
      ctx.moveTo(x, y + cell);
      ctx.lineTo(x + cell, y + cell);
    }
  }
  ctx.stroke();

  const centre = (index: number): [number, number] => [left(index) + cell / 2, top(index) + cell / 2];

  if (scene.path && scene.path.length > 1) {
    ctx.globalAlpha = 1;
    ctx.strokeStyle = palette.path;
    ctx.lineWidth = Math.max(2, cell * 0.28);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(...centre(scene.path[0]));
    for (const index of scene.path.slice(1)) ctx.lineTo(...centre(index));
    ctx.stroke();
  }

  if (scene.head !== null) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.head;
    fill_cell(scene.head, Math.max(1, cell * 0.2));
  }

  if (scene.player !== null) {
    ctx.globalAlpha = 1;
    ctx.fillStyle = palette.player;
    ctx.beginPath();
    ctx.arc(...centre(scene.player), Math.max(2, cell * 0.32), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
}
