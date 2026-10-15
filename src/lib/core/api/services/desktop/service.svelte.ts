import type { DesktopGrid, DesktopItem, GridDesktopService } from "./type";
import type { Bounds, Position } from "$lib/core/utils/type";
import type { AppId, AppProps, AppsService, FilesService, Kernel, OpenOptions } from "$lib/core/api";
import { DesktopHelper, grid_items, type DesktopMove, type ResizeTarget } from "./helper";
import type { WidgetSize } from "../apps/type";
import { ADDITIONS_FILE, ADDITIONS_PATH, default_widgets, parse_additions, pending_widgets, serialize_additions } from "./additions";
import { DEFAULT_SHORTCUTS, DesktopFolder, write_var_lib } from "./folder.svelte";
import {
  LAYOUT_DIRECTORY_NAME,
  LAYOUT_FILE,
  LAYOUT_PATH,
  parse_layout,
  serialize_layout,
  take_v0_pins,
  type Positions,
} from "./layout";

export class DesktopService implements GridDesktopService {
  name = "DesktopService";
  description = "Desktop folder: shortcuts and files in /home/Desktop";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `DesktopService: ${this.folder.entries.length} items`;
  }

  private static DEFAULT_CONFIG = {
    cell_size: 88,
    padding: 12,
  };

  private files_service!: FilesService;
  private apps_service!: AppsService;

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.apps_service = $derived(this.kernel.service<AppsService>("apps"));
  }

  public container = $state.raw<GridDesktopService["container"]>({
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

  private folder = new DesktopFolder({
    files: () => this.files_service,
    apps: () => this.apps_service,
    read_layout: async () => (await (await this.files_service.get_file(LAYOUT_PATH))?.text()) ?? null,
    seed: (folder) => this.seed(folder),
    loaded: (layout) => {
      this.positions = layout === null ? {} : parse_layout(layout);
    },
  });

  /** Where the user put each entry. The folder is the source of truth (ADR-022). */
  private positions = $state<Positions>({});
  private arranged = $derived(DesktopHelper.arrange(this.folder.entries, this.positions));
  private grid = $derived(DesktopHelper.fit(this.container.grid, this.arranged.layout, this.arranged.unplaced));

  async init(): Promise<void> {
    await this.folder.init();
    // Off the boot path: the widget shows up a moment after the desktop does.
    void this.add_default_widgets().catch((error) => console.error("[DesktopService] Failed to add default widgets", error));
  }

  /**
   * Places default widgets this desktop hasn't had yet (owner, 2026-10-14: existing desktops get them once too). An id
   * is recorded once placed, so a widget the user removed stays removed; one already on the desktop counts as placed.
   */
  private async add_default_widgets(): Promise<void> {
    const applied = parse_additions((await (await this.files_service.get_file(ADDITIONS_PATH))?.text()) ?? null);
    const defaults = default_widgets(this.apps_service.list());
    const pending = pending_widgets(applied, defaults);
    if (pending.length === 0) return;

    for (const widget of pending) {
      const present = this.folder.entries.some((entry) => entry.kind === "widget" && entry.app_id === widget.app_id);
      if (!present) await this.folder.write_widget(widget.app_id, { label: widget.label });
    }
    await write_var_lib(this.files_service, LAYOUT_DIRECTORY_NAME, ADDITIONS_FILE, serialize_additions([...applied, ...defaults.map((widget) => widget.id)]));
  }

  destroy(): void {
    this.folder.destroy();
  }

  private async seed(folder: DesktopFolder): Promise<void> {
    const pins = take_v0_pins() ?? DEFAULT_SHORTCUTS.map((app_id, x) => ({ app_id, position: { x, y: 0 } }));
    const positions: Positions = {};
    for (const { app_id, position } of pins) {
      // Pins of v0 apps that weren't ported are dropped by write_shortcut.
      const name = await folder.write_shortcut(app_id);
      if (name) positions[name] = position;
    }
    await this.save_positions(positions);
  }

  private async save_positions(positions: Positions): Promise<void> {
    await write_var_lib(this.files_service, LAYOUT_DIRECTORY_NAME, LAYOUT_FILE, serialize_layout(positions));
  }

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
  }

  public list(): DesktopGrid {
    return this.grid;
  }

  public has_item_in_position(position: Position): boolean {
    return this.get_item(position) !== undefined;
  }

  private get_item(position: Position): DesktopItem | undefined {
    return this.grid[position.y]?.[position.x];
  }

  public move_items(moves: DesktopMove[]): void {
    const resolved = DesktopHelper.resolve_moves(this.grid, this.container.grid, moves);
    if (resolved.size === 0) return;
    this.pin_shown(resolved);
  }

  private pin_shown(moved: Map<string, Position> = new Map()): void {
    // Positions of entries that no longer exist are dropped here.
    const names = new Set(this.folder.names());
    const positions: Positions = Object.fromEntries(Object.entries(this.positions).filter(([name]) => names.has(name)));
    // Pin every visible item to where it's shown, so relocated items don't jump once this cell changes hands.
    for (const { item, x, y } of grid_items(this.grid)) positions[item.name] = { x, y };
    for (const [name, position] of moved) positions[name] = position;
    this.positions = positions;

    this.save_positions(positions).catch((error) => console.error("[DesktopService] Failed to save the layout", error));
  }

  public resize_target(name: string, size: WidgetSize): ResizeTarget | null {
    const item = this.folder.get(name);
    const limits = item?.kind === "widget" ? this.apps_service.get(item.app_id)?.widget_size : undefined;
    return limits ? DesktopHelper.resize_target(this.grid, this.container.grid, name, size, limits) : null;
  }

  public async resize_widget(name: string, size: WidgetSize): Promise<boolean> {
    const target = this.resize_target(name, size);
    if (!target?.valid) return false;
    // An unplaced widget's cell is recomputed on every fit; pinning it keeps the new span growing from where it's shown.
    this.pin_shown();
    await this.folder.write_widget_size(name, target.size);
    return true;
  }

  public items(): DesktopItem[] {
    return this.folder.entries;
  }

  public names(): string[] {
    return this.folder.names();
  }

  public async remove_item(name: string): Promise<void> {
    await this.folder.remove(name);
  }

  public async rename_item(name: string, new_name: string): Promise<void> {
    if (!this.folder.get(name) || name === new_name) return;

    // Carry the cell over to the new name before the rename's reload reads the layout, so the icon doesn't jump.
    const { [name]: position, ...rest } = this.positions;
    const positions = position ? { ...rest, [new_name]: position } : rest;
    this.positions = positions;
    await this.save_positions(positions);
    await this.folder.rename(name, new_name);
  }

  public async create_folder(name: string): Promise<void> {
    await this.folder.create_folder(name);
  }

  public async pin(app_id: AppId, props?: AppProps): Promise<string | null> {
    return this.folder.write_shortcut(app_id, props);
  }

  public async pin_widget(app_id: AppId, options: { label: string; props?: AppProps; size?: WidgetSize }): Promise<string | null> {
    return this.folder.write_widget(app_id, options);
  }

  public open(item: DesktopItem, options?: OpenOptions): void {
    this.folder.open(item, options);
  }
}
