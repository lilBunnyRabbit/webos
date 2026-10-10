import type { DesktopGrid, DesktopGridItem, DesktopService as IDesktopService } from "./type";
import type { Bounds, Dimensions, Position } from "$lib/core/utils/type";
import type { AppId } from "..";
import { DesktopHelper } from "./helper";
/*
TODO: 
- persist
- cleanup
*/

export class DesktopService implements IDesktopService {
  name = "DesktopService";
  description = "DesktopService";

  to_string(): string {
    return `DesktopService: ${this.grid.flat().filter(Boolean).length} items`;
  }

  private static DEFAULT_CONFIG = {
    cell_size: 64,
    padding: 4,
  };

  public container = $state.raw<IDesktopService["container"]>({
    bounds: {
      x: 0,
      y: 0,
      width: window.innerWidth,
      height: window.innerHeight,
    },
    cell: {
      width: 0,
      height: 0,
    },
    grid: {
      columns: 0,
      rows: 0,
    },
    config: DesktopService.DEFAULT_CONFIG,
    element: null,
  });

  /** The user's arrangement. Survives any container size; `grid` is what fits right now. */
  private layout = $state<DesktopGrid>([[{ app_id: "settings" }, { app_id: "file-explorer" }]]);
  private grid = $derived(DesktopHelper.fit(this.container.grid, this.layout));

  public set_container(element?: HTMLElement | null, options?: { cell_size?: number; padding?: number }): void {
    if (!element) {
      this.container = {
        bounds: {
          x: 0,
          y: 0,
          width: window.innerWidth,
          height: window.innerHeight,
        },
        cell: {
          width: 0,
          height: 0,
        },
        grid: {
          columns: 0,
          rows: 0,
        },
        config: DesktopService.DEFAULT_CONFIG,
        element: null,
      };

      // console.log("DesktopService:set_container", this.container);

      return;
    }

    const cell_size = options?.cell_size ?? DesktopService.DEFAULT_CONFIG.cell_size;
    const padding = options?.padding ?? DesktopService.DEFAULT_CONFIG.padding;

    const rect = element.getBoundingClientRect();

    const bounds: Bounds = {
      width: rect.width - padding * 2,
      height: rect.height - padding * 2,
      x: rect.left + padding,
      y: rect.top + padding,
    };

    const columns = Math.floor(bounds.width / cell_size);
    const rows = Math.floor(bounds.height / cell_size);

    this.container = {
      bounds,
      cell: { width: bounds.width / columns, height: bounds.height / rows },
      grid: { columns, rows },
      config: {
        cell_size: cell_size,
        padding: padding,
      },
      element,
    };

    // console.log("DesktopService:set_container", this.container);
  }

  public add_item(app_id: AppId): Position | null {
    const position = DesktopHelper.calculate_item_position(this.container.grid, this.grid);
    if (!position) {
      console.warn("No available position found for item");
      return null;
    }

    this.place(position, { app_id });
    return position;
  }

  public remove_item(position: Position): void {
    const item = this.get_item(position);
    if (item) this.take_from_layout(item);
  }

  public list(): DesktopGrid {
    return this.grid;
  }

  public has_item_in_position(position: Position): boolean {
    return this.get_item(position) !== undefined;
  }

  private get_item(position: Position): DesktopGridItem | undefined {
    return this.grid[position.y]?.[position.x];
  }

  private place(position: Position, item: DesktopGridItem): void {
    // Read the row back through the state proxy: `??=` would hand back the raw array, and writes to it aren't tracked.
    if (!this.layout[position.y]) this.layout[position.y] = [];
    this.layout[position.y][position.x] = item;
  }

  /** Removes an item from wherever the layout holds it, which may differ from where it's shown. */
  private take_from_layout(item: DesktopGridItem): void {
    for (const row of this.layout) {
      const x = row?.indexOf(item) ?? -1;
      if (row && x >= 0) {
        row[x] = undefined;
        return;
      }
    }
  }

  public move_item(from: Position, to: Position): Position {
    if (from.x === to.x && from.y === to.y) {
      return from;
    }

    const item = this.get_item(from);
    if (!item) return from;

    this.take_from_layout(item);
    this.place(to, item);

    return to;
  }
}
