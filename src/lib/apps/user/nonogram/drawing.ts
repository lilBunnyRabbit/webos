import type { Drawing } from "./file";
import { INKS } from "./puzzle";

export const EDITOR_SIDES = [5, 10, 15, 20, 25, 30] as const;

/** The editor paints in every ink by its place in INKS; a file keeps only the inks it uses. */
export function to_editor(drawing: Drawing): Drawing {
  const remap = drawing.palette.map((ink) => INKS.indexOf(ink) + 1);
  return { ...drawing, palette: INKS, cells: drawing.cells.map((cell) => (cell > 0 ? remap[cell - 1] : 0)) };
}

export function blank_drawing(side = 10): Drawing {
  return { width: side, height: side, palette: INKS, cells: new Array(side * side).fill(0) };
}

/** Keeps the top-left of the picture: growing adds empty cells, shrinking crops. */
export function resize(cells: readonly number[], width: number, height: number, next_width: number, next_height: number): number[] {
  return Array.from({ length: next_width * next_height }, (_, index) => {
    const row = Math.floor(index / next_width);
    const col = index % next_width;
    return row < height && col < width ? cells[row * width + col] : 0;
  });
}

/** The editor's sides, plus an opened file's own if it's off the list. */
export function sides_for(current: number): { value: string; label: string }[] {
  const sides: number[] = [...EDITOR_SIDES];
  if (!sides.includes(current)) sides.push(current);
  return sides.sort((a, b) => a - b).map((side) => ({ value: String(side), label: String(side) }));
}
