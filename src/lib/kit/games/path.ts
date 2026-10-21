export type PathRule = (from: number, to: number, path: readonly number[]) => boolean;

export function orthogonal(width: number, a: number, b: number): boolean {
  const diff = Math.abs(a - b);
  return diff === width || (diff === 1 && Math.floor(a / width) === Math.floor(b / width));
}

/** A cell already on the path cuts back to it; returns the same array when nothing changes, so a refusal shows by identity. */
export function path_step(path: readonly number[], cell: number, can_step: PathRule): readonly number[] {
  if (!path.length) return path;
  const at = path.lastIndexOf(cell);
  if (at === path.length - 1) return path;
  if (at >= 0) return path.slice(0, at + 1);
  return can_step(path[path.length - 1], cell, path) ? [...path, cell] : path;
}

/** Cells after `from` up to `to`, one side-step at a time along the straight line: what a fast drag skipped over. */
export function grid_walk(width: number, from: number, to: number, rows_first = false): number[] {
  let row = Math.floor(from / width);
  let col = from % width;
  const to_row = Math.floor(to / width);
  const to_col = to % width;
  const cells: number[] = [];
  while (row !== to_row || col !== to_col) {
    const rows_left = Math.abs(to_row - row);
    const cols_left = Math.abs(to_col - col);
    if (rows_left > cols_left || (rows_left === cols_left && rows_first)) row += Math.sign(to_row - row);
    else col += Math.sign(to_col - col);
    cells.push(row * width + col);
  }
  return cells;
}

export function path_walk(path: readonly number[], cells: readonly number[], can_step: PathRule): readonly number[] {
  let next = path;
  for (const cell of cells) {
    const stepped = path_step(next, cell, can_step);
    if (stepped === next && next[next.length - 1] !== cell) break;
    next = stepped;
  }
  return next;
}
