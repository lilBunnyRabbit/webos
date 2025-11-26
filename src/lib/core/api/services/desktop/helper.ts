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

  // TODO: more complex logic for moving items - persist original position for restore
  public static recalculate_grid_positions(
    dimensions: { columns: number; rows: number },
    grid: DesktopGrid
  ): DesktopGrid {
    const recalculated: DesktopGrid = [];

    const add_from_start = (item: DesktopGridItem) => {
      console.log("add_from_start", item.app_id);
      for (let y = 0; y < dimensions.rows; y++) {
        if (!recalculated[y] || !recalculated[y].length) {
          recalculated[y] = [item];
          return;
        }
  
        for (let x = 0; x < dimensions.columns; x++) {
          if (recalculated[y][x] === undefined) {
            recalculated[y][x] = item;
            return;
          }
        }
      }
    }

    // const top_down_move = (from: Position, item: DesktopGridItem) => {
    //   console.log("TOP DOWN", from, item.app_id, [...recalculated]);

    //   // Check if row has empty space
    //   if (!recalculated[from.y]) {
    //     recalculated[from.y] = [];
    //   }

    //   const start_x = Math.min(Math.max(from.x - 1, 0), dimensions.columns - 1);
    //   console.log("start_x", start_x);
    //   // Into row from right to left
    //   console.log("into row from right to left", start_x);
    //   for (let x = start_x; x >= 0; x--) {
    //     if (recalculated[from.y][x] === undefined) {
    //       console.log("input item rl", { x, y: from.y }, item.app_id);
    //       recalculated[from.y][x] = item;
    //       return;
    //     }
    //   }

    //   // Go to next row and input from left
    //   console.log("go to next row and input from left", from.y + 1);
    //   for (let y = from.y + 1; y < dimensions.rows; y++) {
    //     console.log("recalculated[y]", recalculated[y], [...recalculated]);
    //     if (recalculated[y] === undefined) {
    //       recalculated[y] = [];
    //       console.log("input item yl", { x: 0, y: from.y + 1 }, item.app_id);

    //       recalculated[y][0] = item;
    //       return;
    //     }

    //     for (let x = 0; x < dimensions.columns; x++) {
    //       if (recalculated[y][x] === undefined) {
    //         console.log("input item yl0", { x,y }, item.app_id)
    //         recalculated[y][x] = item;
    //         return;
    //       }
    //     }
    //   }
    // };

    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      if (!row) continue;

      for (let x = 0; x < row.length; x++) {
        const item = row[x];
        if (item === undefined) continue;

        if (x > dimensions.columns - 1 || y > dimensions.rows - 1 || recalculated[y]?.[x] !== undefined) {
          add_from_start(item);
        } else {
          if (!recalculated[y]) {
            recalculated[y] = [];
          }

          recalculated[y][x] = item;
        }
      }
    }

    return recalculated;
  }
}
