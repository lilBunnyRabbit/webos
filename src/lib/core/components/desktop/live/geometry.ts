export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * The cells the desktop's grid dots tile: a dot on every grid line crossing of the icon area, `columns + 1` by
 * `rows + 1`, each cell centred on its dot. Same math as the `[data-dots]` CSS in `desktop.svelte`.
 */
export function dot_cells(area: Rect, cell: { width: number; height: number }, grid: { columns: number; rows: number }): Rect[] {
  if (grid.columns <= 0 || grid.rows <= 0 || cell.width <= 0 || cell.height <= 0) return [];
  const cells: Rect[] = [];
  for (let row = 0; row <= grid.rows; row++) {
    for (let column = 0; column <= grid.columns; column++) {
      cells.push({
        x: area.x + column * cell.width - cell.width / 2,
        y: area.y + row * cell.height - cell.height / 2,
        width: cell.width,
        height: cell.height,
      });
    }
  }
  return cells;
}

export function tile_cells(area: Rect, size: number): Rect[] {
  if (size <= 0) return [];
  const cells: Rect[] = [];
  for (let y = 0; y < area.height; y += size) {
    for (let x = 0; x < area.width; x += size) cells.push({ x: area.x + x, y: area.y + y, width: size, height: size });
  }
  return cells;
}

export function centre(rect: Rect): Point {
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

export function contains(rect: Rect, point: Point): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}
