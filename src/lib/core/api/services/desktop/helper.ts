import type { DesktopGrid, DesktopItem } from "./type";
import type { Positions } from "./layout";
import type { Position } from "$lib/core/utils/type";

export interface DesktopMove {
  name: string;
  to: Position;
}

export class DesktopHelper {
  /**
   * The user's arrangement: each entry at its saved cell. Entries without a position, or whose cell is already taken,
   * come back as `unplaced`.
   */
  public static arrange(entries: DesktopItem[], positions: Positions): { layout: DesktopGrid; unplaced: DesktopItem[] } {
    const layout: DesktopGrid = [];
    const unplaced: DesktopItem[] = [];

    for (const entry of entries) {
      const position = positions[entry.name];
      if (position && layout[position.y]?.[position.x] === undefined) {
        (layout[position.y] ??= [])[position.x] = entry;
      } else {
        unplaced.push(entry);
      }
    }

    return { layout, unplaced };
  }

  /**
   * Where a dragged group lands (ADR-011 revision). Each item takes its target cell when it's on the grid and not taken
   * by an item that stays; otherwise the nearest free cell. Earlier moves claim first. An item with nowhere to go is
   * left out, so it keeps its cell.
   */
  public static resolve_moves(grid: DesktopGrid, dimensions: { columns: number; rows: number }, moves: DesktopMove[]): Map<string, Position> {
    const moving = new Set(moves.map((move) => move.name));
    const taken = new Set<string>();
    grid.forEach((row, y) => row?.forEach((item, x) => item && !moving.has(item.name) && taken.add(`${x},${y}`)));

    const free = (x: number, y: number) => x >= 0 && y >= 0 && x < dimensions.columns && y < dimensions.rows && !taken.has(`${x},${y}`);
    const resolved = new Map<string, Position>();

    for (const { name, to } of moves) {
      let best: Position | null = free(to.x, to.y) ? to : null;
      if (!best) {
        let distance = Infinity;
        for (let y = 0; y < dimensions.rows; y++) {
          for (let x = 0; x < dimensions.columns; x++) {
            const d = (x - to.x) ** 2 + (y - to.y) ** 2;
            if (d < distance && free(x, y)) {
              distance = d;
              best = { x, y };
            }
          }
        }
      }
      if (!best) continue;
      taken.add(`${best.x},${best.y}`);
      resolved.set(name, best);
    }

    return resolved;
  }

  /**
   * The visible grid for the current size. Items inside the grid keep their cell. Items outside it, then unplaced
   * items, take the first free cells. Whatever still doesn't fit is left out of the view, never out of the layout.
   */
  public static fit(
    dimensions: { columns: number; rows: number },
    layout: DesktopGrid,
    unplaced: DesktopItem[] = []
  ): DesktopGrid {
    const fitted: DesktopGrid = [];
    const overflow: DesktopItem[] = [];

    layout.forEach((row, y) => {
      row?.forEach((item, x) => {
        if (item === undefined) return;
        if (x < dimensions.columns && y < dimensions.rows) {
          (fitted[y] ??= [])[x] = item;
        } else {
          overflow.push(item);
        }
      });
    });
    overflow.push(...unplaced);

    for (let y = 0; y < dimensions.rows && overflow.length > 0; y++) {
      for (let x = 0; x < dimensions.columns && overflow.length > 0; x++) {
        if (fitted[y]?.[x] === undefined) {
          (fitted[y] ??= [])[x] = overflow.shift();
        }
      }
    }

    return fitted;
  }
}
