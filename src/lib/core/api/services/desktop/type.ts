import type { IService } from "../../type";
import type { Bounds, Dimensions, Position } from "$lib/core/utils/type";
import type { AppId, AppProps, OpenOptions } from "..";

/**
 * The `/home/Desktop` folder as items, addressed by entry name (ADR-022). Platform-neutral (ADR-016): the desktop grid
 * and the mobile home both implement it, each with its own layout on top.
 */
export interface DesktopService extends IService {
  /** Every visible entry in `/home/Desktop`, in folder order. */
  items(): DesktopItem[];

  /** Entry names currently on the desktop, for name validation. */
  names(): string[];

  /** Deletes the entry (folders recursively). The caller confirms first (ADR-025). */
  remove_item(name: string): Promise<void>;

  /** Renames the entry, keeping its place in the layout. Throws if the name is taken. */
  rename_item(name: string, new_name: string): Promise<void>;

  /** Creates a folder in `/home/Desktop`. */
  create_folder(name: string): Promise<void>;

  /** Writes `{App name}.desktop` into `/home/Desktop`. Returns the file name, or `null` for an unknown app. */
  pin(app_id: AppId, props?: AppProps): Promise<string | null>;

  /** Shortcut or file → `apps.open` (a shortcut launches its target), folder → File Explorer there. */
  open(item: DesktopItem, options?: OpenOptions): void;
}

/** The desktop shell's icon grid: saved cells in `/var/lib/desktop/layout.json`, fitted to the measured container. */
export interface GridDesktopService extends DesktopService {
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

  /** The visible grid: entries at their saved cells, fitted to the current size. */
  list(): DesktopGrid;

  has_item_in_position(position: Position): boolean;

  /** Saves the item's new cell to `/var/lib/desktop/layout.json`. */
  move_item(from: Position, to: Position): Position;
}

/** The mobile home (ADR-016): an ordered flow of entries, paged by capacity, plus a dock. */
export interface MobileDesktopService extends DesktopService {
  /** Entries not in the dock, in the user's order, chunked into pages of `capacity`. Always at least one page. */
  pages(capacity: number): DesktopItem[][];

  /** Dock entries, in dock order. */
  dock(): DesktopItem[];

  /** Moves an entry to `index` in the home order (index among non-dock entries). Saves the layout. */
  move_item(name: string, index: number): void;

  /** Adds the entry to the dock (at the end) or takes it out (back into the home order). */
  set_docked(name: string, docked: boolean): void;

  /** Whether the dock has room for one more entry. */
  readonly dock_full: boolean;
}

export type DesktopGrid = Array<Array<DesktopItem | undefined>>;

export type DesktopItem =
  | { kind: "shortcut"; name: string; label: string; app_id: AppId; props?: AppProps }
  | { kind: "file"; name: string; type: string }
  | { kind: "directory"; name: string };
