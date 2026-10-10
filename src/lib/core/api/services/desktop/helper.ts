import type { DesktopGrid, DesktopGridItem } from "./type";
import type { Positions } from "./layout";

export class DesktopHelper {
  /**
   * The user's arrangement: each entry at its saved cell. Entries without a position, or whose cell is already taken,
   * come back as `unplaced`.
   */
  public static arrange(entries: DesktopGridItem[], positions: Positions): { layout: DesktopGrid; unplaced: DesktopGridItem[] } {
    const layout: DesktopGrid = [];
    const unplaced: DesktopGridItem[] = [];

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
   * The visible grid for the current size. Items inside the grid keep their cell. Items outside it, then unplaced
   * items, take the first free cells. Whatever still doesn't fit is left out of the view, never out of the layout.
   */
  public static fit(
    dimensions: { columns: number; rows: number },
    layout: DesktopGrid,
    unplaced: DesktopGridItem[] = []
  ): DesktopGrid {
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
