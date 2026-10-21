export type Axis = "row" | "col";

/** Where arrow keys, Home and End move a cursor at `index`, stopping at the edges; null for any other key. */
export function grid_key_move(key: string, index: number, width: number, height: number): number | null {
  const row = Math.floor(index / width);
  const col = index % width;
  switch (key) {
    case "ArrowUp":
      return Math.max(0, row - 1) * width + col;
    case "ArrowDown":
      return Math.min(height - 1, row + 1) * width + col;
    case "ArrowLeft":
      return row * width + Math.max(0, col - 1);
    case "ArrowRight":
      return row * width + Math.min(width - 1, col + 1);
    case "Home":
      return row * width;
    case "End":
      return row * width + width - 1;
    default:
      return null;
  }
}

/** The axis a drag from `start` locks to on reaching `index`: the line they share, else the longer way. */
export function stroke_axis(width: number, start: number, index: number): Axis {
  const [start_row, start_col] = [Math.floor(start / width), start % width];
  const [row, col] = [Math.floor(index / width), index % width];
  if (row === start_row) return "row";
  if (col === start_col) return "col";
  return Math.abs(col - start_col) >= Math.abs(row - start_row) ? "row" : "col";
}

/** Locked to its axis, a stroke ends at the pointer's projection onto the start cell's row or column. */
export function stroke_end(width: number, start: number, index: number, axis: Axis | null): number {
  return axis === "row"
    ? Math.floor(start / width) * width + (index % width)
    : Math.floor(index / width) * width + (start % width);
}

/** Cells from `from` to `to` along one axis, the way a drag paints: locked to the first direction it moves. */
export function stroke_cells(width: number, from: number, to: number, axis: Axis | null): number[] {
  const [r0, c0] = [Math.floor(from / width), from % width];
  const [r1, c1] = [Math.floor(to / width), to % width];
  const along_row = axis ? axis === "row" : Math.abs(c1 - c0) >= Math.abs(r1 - r0);
  const cells: number[] = [];
  if (along_row) {
    const step = Math.sign(c1 - c0) || 1;
    for (let c = c0; c !== c1 + step; c += step) cells.push(r0 * width + c);
  } else {
    const step = Math.sign(r1 - r0) || 1;
    for (let r = r0; r !== r1 + step; r += step) cells.push(r * width + c0);
  }
  return cells;
}

/**
 * Edges between side-by-side cells, for clues drawn between them (signs, walls). Edge `index` of the across edges is
 * `row * (width - 1) + col`, between (row, col) and (row, col + 1); of the down edges `row * width + col`, between
 * (row, col) and (row + 1, col). These give the two cells an edge joins.
 */
export function across_cells(width: number, index: number): [number, number] {
  const a = Math.floor(index / (width - 1)) * width + (index % (width - 1));
  return [a, a + 1];
}

export function down_cells(width: number, index: number): [number, number] {
  return [index, index + width];
}
