import type { DesktopGrid, DesktopService as IDesktopService } from "./type";
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

  private grid = $state<DesktopGrid>([["example", "example"]]);

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

      console.log("DesktopService:set_container", this.container);

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

    console.log("DesktopService:set_container", this.container);
    //         return set(() => ({ container, items: recalculateGridPositions(container.grid, get().items) }));
  }

  public add_item(appId: AppId): void {
    const [x, y] = DesktopHelper.calculate_item_position(this.container.grid, this.grid);
    this.set_item({ x, y }, appId);
  }

  public remove_item(position: Position): void {
    this.set_item(position, undefined);
  }

  public list(): DesktopGrid {
    return this.grid;
  }

  public has_item_in_position(position: Position): boolean {
    return this.get_item(position) !== undefined;
  }

  private get_item(position: Position): AppId | undefined {
    return this.grid[position.y]?.[position.x];
  }

  private set_item(position: Position, appId: AppId | undefined): void {
    if (!this.grid[position.y]) {
      this.grid[position.y] = [];
    }

    this.grid[position.y][position.x] = appId;
  }

  public move_item(from: Position, to: Position): void {
    if (from.x === to.x && from.y === to.y) return;

    this.set_item(to, this.get_item(from));
    this.set_item(from, undefined);

    console.log("DesktopService:move_item", from, to, this.grid);
  }
}
