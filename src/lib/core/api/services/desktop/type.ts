import type { IService } from "../../type";
import type { Bounds, Dimensions, Position } from "$lib/core/utils/type";
import type { AppId } from "..";

export interface DesktopService extends IService {
  readonly container: {
    bounds: Bounds;
    cell: Dimensions;
    grid: {
      columns: number;
      rows: number;
    };
    config: {
      cell_size: number;
      padding: number;
    };
    element: HTMLElement | null;
  };

  set_container(element?: HTMLElement | null, options?: { cell_size?: number; padding?: number }): void;

  add_item(appId: AppId): void;

  remove_item(position: Position): void;

  has_item_in_position(position: Position): boolean;

  move_item(from: Position, to: Position): void;

  list(): DesktopGrid;
}

export type DesktopGrid = Array<Array<AppId | undefined>>;