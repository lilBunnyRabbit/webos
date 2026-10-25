import type { IService } from "../../type";
import type { Bounds, Dimensions, Position } from "$lib/core/utils/type";
import type { AppId, AppProps, OpenOptions } from "..";
import type { WidgetSize, WidgetStyle } from "../apps/type";
import type { DesktopMove, ResizeTarget } from "./helper";

export type { DesktopMove, ResizeTarget };

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

  /**
   * Writes `{label}.widget` into `/home/Desktop` (ADR-034). `size` defaults to the manifest's `widget_size.default` and
   * is clamped into its range. Returns the file name, or `null` for an app without a widget. The mobile home shows
   * the same file.
   */
  pin_widget(app_id: AppId, options: { label: string; props?: AppProps; size?: WidgetSize }): Promise<string | null>;

  /**
   * Writes `style` into the `.widget` file `name`, shared by the desktop and the phone home. Resolves `false` when
   * `name` isn't a widget.
   */
  set_widget_style(name: string, style: WidgetStyle): Promise<boolean>;

  /** Shortcut, widget or file → `apps.open` (a shortcut or widget launches its app), folder → File Explorer there. */
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

  /**
   * Moves items to new cells in one layout write (`/var/lib/desktop/layout.json`). A target that's taken or off the
   * grid becomes the nearest free cell (`DesktopHelper.resolve_moves`).
   */
  move_items(moves: DesktopMove[]): void;

  /** Where resizing the widget `name` to `size` would land; `null` when it isn't a resizable widget on the grid. */
  resize_target(name: string, size: WidgetSize): ResizeTarget | null;

  /** Writes a valid `resize_target` into the `.widget` file. Resolves `false` when the size was refused. */
  resize_widget(name: string, size: WidgetSize): Promise<boolean>;
}

/** The mobile home (ADR-016): one ordered list of entries and widgets. */
export interface MobileDesktopService extends DesktopService {
  /** Every entry in the user's order; entries the saved order doesn't know follow in folder order. */
  home(): DesktopItem[];

  /** Moves an entry in the home order to just before `before` (`null`: the end). */
  move_item(name: string, before: string | null): void;

  /**
   * Writes `size`, clamped into the app's `widget_size`, into the `.widget` file. Resolves `false` when `name` isn't a
   * widget of an app with a `widget_size`. The size is shared with the desktop; the list home shows only its height.
   */
  resize_widget(name: string, size: WidgetSize): Promise<boolean>;
}

export type DesktopGrid = Array<Array<DesktopItem | undefined>>;

export type DesktopItem =
  | { kind: "shortcut"; name: string; label: string; app_id: AppId; props?: AppProps }
  | { kind: "widget"; name: string; label: string; app_id: AppId; props?: AppProps; size: WidgetSize; style: WidgetStyle }
  | { kind: "file"; name: string; type: string }
  | { kind: "directory"; name: string };
