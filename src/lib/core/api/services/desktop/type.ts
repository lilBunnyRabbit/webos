import type { IService } from "../../type";
import type { Bounds, Dimensions, Position } from "$lib/core/utils/type";
import type { AppId, AppProps, OpenOptions } from "..";

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

  /** The visible grid: `/home/Desktop` entries at their saved cells, fitted to the current size (ADR-022). */
  list(): DesktopGrid;

  has_item_in_position(position: Position): boolean;

  /** Saves the item's new cell to `/var/lib/desktop/layout.json`. */
  move_item(from: Position, to: Position): Position;

  /** Deletes a shortcut file. Real files and folders are left alone until window overlays can confirm (ADR-022). */
  remove_item(position: Position): Promise<void>;

  /** Writes `{App name}.desktop` into `/home/Desktop`. Returns the file name, or `null` for an unknown app. */
  pin(app_id: AppId, props?: AppProps): Promise<string | null>;

  /** Shortcut or file → `apps.open` (a shortcut launches its target), folder → File Explorer there. */
  open(item: DesktopGridItem, options?: OpenOptions): void;
}

export type DesktopGrid = Array<Array<DesktopGridItem | undefined>>;

export type DesktopGridItem =
  | { kind: "shortcut"; name: string; label: string; app_id: AppId; props?: AppProps }
  | { kind: "file"; name: string; type: string }
  | { kind: "directory"; name: string };
