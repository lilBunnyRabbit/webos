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

  add_item(app_id: AppId): Position | null;

  remove_item(position: Position): void;

  has_item_in_position(position: Position): boolean;

  move_item(from: Position, to: Position): Position;

  list(): DesktopGrid;
}

export type DesktopGrid = Array<Array<DesktopGridItem | undefined>>;

export type DesktopGridItem = {
  app_id: AppId;
}