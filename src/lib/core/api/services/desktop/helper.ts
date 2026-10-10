import type { AppId, DesktopGrid, DesktopGridItem } from "..";
import type { Position } from "$lib/core/utils/type";

export class DesktopHelper {
  public static calculate_item_position(
    dimensions: { columns: number; rows: number },
    grid: DesktopGrid
  ): Position | null {
    for (let y = 0; y < dimensions.rows; y++) {
      if (!grid[y] || !grid[y].length) {
        return { x: 0, y };
      }

      for (let x = 0; x < dimensions.columns; x++) {
        if (grid[y][x] === undefined) {
          return { x, y };
        }
      }
    }

    return null;
  }

  /**
   * The visible grid for the current size. Items inside the grid keep their cell. Items outside it take the first free
   * cell, and items with no free cell are left out of the view; the layout itself is never trimmed.
   */
  public static fit(dimensions: { columns: number; rows: number }, layout: DesktopGrid): DesktopGrid {
    const fitted: DesktopGrid = [];
    const overflow: DesktopGridItem[] = [];

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
