import type { DesktopGrid, DesktopItem, GridDesktopService } from "./type";
import type { Bounds, Position } from "$lib/core/utils/type";
import type { AppId, AppProps, AppsService, FilesService, Kernel, OpenOptions } from "$lib/core/api";
import { DesktopHelper } from "./helper";
import { DEFAULT_SHORTCUTS, DesktopFolder, write_var_lib } from "./folder.svelte";
import { LAYOUT_DIRECTORY_NAME, LAYOUT_FILE, LAYOUT_PATH, parse_layout, serialize_layout, take_v0_pins, type Positions } from "./layout";

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

  public list(): DesktopGrid {
    return this.grid;
  }

  public has_item_in_position(position: Position): boolean {
    return this.get_item(position) !== undefined;
  }

  private get_item(position: Position): DesktopItem | undefined {
    return this.grid[position.y]?.[position.x];
  }

  public move_item(from: Position, to: Position): Position {
    if (from.x === to.x && from.y === to.y) {
      return from;
    }

    const item = this.get_item(from);
    if (!item) return from;

    // Positions of entries that no longer exist are dropped here.
    const names = new Set(this.folder.names());
    const positions: Positions = Object.fromEntries(Object.entries(this.positions).filter(([name]) => names.has(name)));
    // Pin every visible item to where it's shown, so relocated items don't jump once this cell changes hands.
    this.grid.forEach((row, y) => row?.forEach((entry, x) => entry && (positions[entry.name] = { x, y })));
    positions[item.name] = to;
    this.positions = positions;

    this.save_positions(positions).catch((error) => console.error("[DesktopService] Failed to save the layout", error));

    return to;
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

  public open(item: DesktopItem, options?: OpenOptions): void {
    this.folder.open(item, options);
  }
}
