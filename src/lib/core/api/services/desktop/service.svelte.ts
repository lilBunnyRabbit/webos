import type { DesktopGrid, DesktopGridItem, DesktopService as IDesktopService } from "./type";
import type { Bounds, Position } from "$lib/core/utils/type";
import type { AppId, AppProps, AppsService, FilesService, Kernel, OpenOptions } from "$lib/core/api";
import { parse_shortcut, serialize_shortcut, shortcut_label, SHORTCUT_EXTENSION } from "../apps/shortcut";
import { file_extension } from "../apps/associations";
import { PATHS } from "../files/hierarchy";
import { available_name } from "../files/opfs";
import { join_path, split_path } from "../files/path";
import { DesktopHelper } from "./helper";
import { LAYOUT_DIRECTORY, LAYOUT_FILE, LAYOUT_PATH, parse_layout, serialize_layout, take_v0_pins, type Positions } from "./layout";

/** Shortcuts written into an empty desktop on first boot. */
const DEFAULT_SHORTCUTS: AppId[] = ["settings", "file-explorer"];

export class DesktopService implements IDesktopService {
  name = "DesktopService";
  description = "Desktop folder: shortcuts and files in /home/Desktop";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `DesktopService: ${this.entries.length} items`;
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

  /** What's in /home/Desktop and where the user put it. The folder is the source of truth (ADR-022). */
  private entries = $state<DesktopGridItem[]>([]);
  private positions = $state<Positions>({});
  private arranged = $derived(DesktopHelper.arrange(this.entries, this.positions));
  private grid = $derived(DesktopHelper.fit(this.container.grid, this.arranged.layout, this.arranged.unplaced));

  private dispose_watch?: () => void;
  private reload_id = 0;

  async init(): Promise<void> {
    await this.reload();

    this.dispose_watch = $effect.root(() => {
      let first = true;
      $effect(() => {
        this.files_service.revision(PATHS.desktop);
        // The first run only subscribes; init() already loaded the folder.
        if (first) {
          first = false;
          return;
        }
        this.reload().catch((error) => console.error("[DesktopService] Failed to reload the desktop", error));
      });
    });
  }

  destroy(): void {
    this.dispose_watch?.();
  }

  private async folder(): Promise<FileSystemDirectoryHandle> {
    const folder = await this.files_service.get_directory(PATHS.desktop);
    if (!folder) throw new Error(`${PATHS.desktop} is missing`);
    return folder;
  }

  private async reload(): Promise<void> {
    const id = ++this.reload_id;
    const folder = await this.folder();
    const items = await this.files_service.list(folder);

    const layout_file = await this.files_service.get_file(LAYOUT_PATH);
    const visible = items.filter((item) => !item.name.startsWith("."));

    // An empty folder with no layout file has never been set up: seed it once, then read what was written. The layout
    // file the seed writes stops this from running again.
    if (!layout_file && visible.length === 0) {
      await this.seed(folder);
      return this.reload();
    }

    const entries: DesktopGridItem[] = [];
    for (const item of visible) {
      if (item.kind === "directory") {
        entries.push({ kind: "directory", name: item.name });
        continue;
      }

      const shortcut =
        file_extension(item.name) === SHORTCUT_EXTENSION ? parse_shortcut(await (await item.handle.getFile()).text()) : null;
      entries.push(
        shortcut
          ? { kind: "shortcut", name: item.name, label: shortcut_label(item.name), ...shortcut }
          : { kind: "file", name: item.name, type: item.type ?? "" }
      );
    }

    const positions = layout_file ? parse_layout(await layout_file.text()) : {};

    // A newer reload started while this one was reading; its result wins.
    if (id !== this.reload_id) return;
    this.entries = entries;
    this.positions = positions;
  }

  private async seed(folder: FileSystemDirectoryHandle): Promise<void> {
    const pins = take_v0_pins() ?? DEFAULT_SHORTCUTS.map((app_id, x) => ({ app_id, position: { x, y: 0 } }));
    const positions: Positions = {};
    for (const { app_id, position } of pins) {
      // Pins of v0 apps that weren't ported are dropped by write_shortcut.
      const name = await this.write_shortcut(folder, app_id);
      if (name) positions[name] = position;
    }
    await this.save_positions(positions);
  }

  private async write_shortcut(folder: FileSystemDirectoryHandle, app_id: AppId, props?: AppProps): Promise<string | null> {
    const manifest = this.apps_service.get(app_id);
    if (!manifest) return null;

    const name = await available_name(folder, `${manifest.name}${SHORTCUT_EXTENSION}`);
    await this.files_service.create_file(folder, name, { content: serialize_shortcut({ app_id, props }) });
    return name;
  }

  private async save_positions(positions: Positions): Promise<void> {
    let directory = await this.files_service.get_directory(LAYOUT_DIRECTORY);
    if (!directory) {
      const var_lib = await this.files_service.get_directory(PATHS.var_lib);
      if (!var_lib) throw new Error(`${PATHS.var_lib} is missing`);
      directory = await this.files_service.create_directory(var_lib, "desktop");
    }
    await this.files_service.create_file(directory, LAYOUT_FILE, { content: serialize_layout(positions), overwrite: true });
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

  private get_item(position: Position): DesktopGridItem | undefined {
    return this.grid[position.y]?.[position.x];
  }

  public move_item(from: Position, to: Position): Position {
    if (from.x === to.x && from.y === to.y) {
      return from;
    }

    const item = this.get_item(from);
    if (!item) return from;

    // Positions of entries that no longer exist are dropped here.
    const names = new Set(this.entries.map((entry) => entry.name));
    const positions: Positions = Object.fromEntries(Object.entries(this.positions).filter(([name]) => names.has(name)));
    // Pin every visible item to where it's shown, so relocated items don't jump once this cell changes hands.
    this.grid.forEach((row, y) => row?.forEach((entry, x) => entry && (positions[entry.name] = { x, y })));
    positions[item.name] = to;
    this.positions = positions;

    this.save_positions(positions).catch((error) => console.error("[DesktopService] Failed to save the layout", error));

    return to;
  }

  public async remove_item(position: Position): Promise<void> {
    const item = this.get_item(position);
    if (!item) return;
    await this.files_service.delete_entry(await this.folder(), item.name, { recursive: item.kind === "directory" });
  }

  public async rename_item(position: Position, new_name: string): Promise<void> {
    const item = this.get_item(position);
    if (!item || item.name === new_name) return;

    // Carry the cell over to the new name before the rename's reload reads the layout, so the icon doesn't jump.
    const { [item.name]: _old, ...rest } = this.positions;
    const positions = { ...rest, [new_name]: position };
    this.positions = positions;
    await this.save_positions(positions);
    await this.files_service.rename_entry(await this.folder(), item.name, new_name);
  }

  public async create_folder(name: string): Promise<void> {
    await this.files_service.create_directory(await this.folder(), name);
  }

  public names(): string[] {
    return this.entries.map((entry) => entry.name);
  }

  public async pin(app_id: AppId, props?: AppProps): Promise<string | null> {
    return this.write_shortcut(await this.folder(), app_id, props);
  }

  public open(item: DesktopGridItem, options?: OpenOptions): void {
    switch (item.kind) {
      case "shortcut":
      case "file":
        // Shortcuts go through open() too, so a missing target app gets the same "Broken shortcut" toast as in Explorer.
        this.apps_service
          .open(join_path(split_path(PATHS.desktop), item.name), options)
          .catch((error) => console.error(`[DesktopService] Failed to open ${item.name}`, error));
        return;
      case "directory":
        this.apps_service.launch("file-explorer", { path: join_path(split_path(PATHS.desktop), item.name) });
    }
  }
}
