import type { AppId, AppProps, AppsService, FilesService, Kernel, OpenOptions } from "$lib/core/api";
import { DEFAULT_SHORTCUTS, DesktopFolder, write_var_lib } from "./folder.svelte";
import {
  arrange_home,
  DOCK_SIZE,
  EMPTY_HOME_LAYOUT,
  HOME_LAYOUT_FILE,
  HOME_LAYOUT_PATH,
  paginate_spans,
  parse_home_layout,
  serialize_home_layout,
  type HomeLayout,
  type HomeSlot,
} from "./home-layout";
import { LAYOUT_DIRECTORY_NAME, LAYOUT_PATH } from "./layout";
import type { DesktopItem, MobileDesktopService as IMobileDesktopService } from "./type";
import type { WidgetSize, WidgetStyle } from "../apps/type";
import { clamp_widget_size } from "../apps/widget";

export class MobileDesktopService implements IMobileDesktopService {
  name = "MobileDesktopService";
  description = "Home screen: /home/Desktop as pages of icons plus a dock";
  inspector = () => import("./mobile-inspector.svelte");

  to_string(): string {
    return `MobileDesktopService: ${this.arranged.home.length} on home, ${this.arranged.dock.length} in the dock`;
  }

  private files_service!: FilesService;
  private apps_service!: AppsService;

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.apps_service = $derived(this.kernel.service<AppsService>("apps"));
  }

  private folder = new DesktopFolder({
    files: () => this.files_service,
    apps: () => this.apps_service,
    read_layout: async () => (await (await this.files_service.get_file(HOME_LAYOUT_PATH))?.text()) ?? null,
    seed: (folder) => this.seed(folder),
    loaded: (layout) => {
      this.layout = layout === null ? EMPTY_HOME_LAYOUT : parse_home_layout(layout);
    },
  });

  private layout = $state<HomeLayout>(EMPTY_HOME_LAYOUT);
  private arranged = $derived(arrange_home(this.folder.entries, this.layout));

  public readonly dock_full = $derived(this.arranged.dock.length >= DOCK_SIZE);

  async init(): Promise<void> {
    await this.folder.init();
  }

  destroy(): void {
    this.folder.destroy();
  }

  /**
   * Runs only for an empty folder with no home layout. A desktop layout means the desktop was set up and then emptied on
   * purpose, so only the home layout is written. Otherwise this is a first boot on mobile: the default shortcuts go in.
   */
  private async seed(folder: DesktopFolder): Promise<void> {
    if (await this.files_service.get_file(LAYOUT_PATH)) {
      await this.save(EMPTY_HOME_LAYOUT);
      return;
    }

    const order: string[] = [];
    for (const app_id of DEFAULT_SHORTCUTS) {
      const name = await folder.write_shortcut(app_id);
      if (name) order.push(name);
    }
    await this.save({ order, dock: [] });
  }

  private async save(layout: HomeLayout): Promise<void> {
    await write_var_lib(this.files_service, LAYOUT_DIRECTORY_NAME, HOME_LAYOUT_FILE, serialize_home_layout(layout));
  }

  /** Applies at once, writes in the background. Stale names are pruned because the layout is rebuilt from what's shown. */
  private commit(home: string[], dock: string[]): void {
    const layout = { order: home, dock };
    this.layout = layout;
    this.save(layout).catch((error) => console.error("[MobileDesktopService] Failed to save the home layout", error));
  }

  public items(): DesktopItem[] {
    return this.folder.entries;
  }

  public names(): string[] {
    return this.folder.names();
  }

  public home(): DesktopItem[] {
    return this.arranged.home;
  }

  public pages(columns: number, rows: number): HomeSlot[][] {
    return paginate_spans(this.arranged.home, columns, rows);
  }

  public dock(): DesktopItem[] {
    return this.arranged.dock;
  }

  public move_item(name: string, before: string | null): void {
    if (!this.folder.get(name) || name === before) return;

    const home = this.arranged.home.map((entry) => entry.name).filter((entry) => entry !== name);
    const dock = this.arranged.dock.map((entry) => entry.name).filter((entry) => entry !== name);
    const index = before === null ? -1 : home.indexOf(before);
    home.splice(index === -1 ? home.length : index, 0, name);
    this.commit(home, dock);
  }

  public set_docked(name: string, docked: boolean, before: string | null = null): void {
    const entry = this.folder.get(name);
    if (!entry || name === before || (docked && entry.kind === "widget")) return;

    const home = this.arranged.home.map((entry) => entry.name).filter((entry) => entry !== name);
    const dock = this.arranged.dock.map((entry) => entry.name).filter((entry) => entry !== name);
    if (docked) {
      if (dock.length >= DOCK_SIZE) return;
      const index = before === null ? -1 : dock.indexOf(before);
      dock.splice(index === -1 ? dock.length : index, 0, name);
    } else {
      home.push(name);
    }
    this.commit(home, dock);
  }

  public async resize_widget(name: string, size: WidgetSize): Promise<boolean> {
    const entry = this.folder.get(name);
    if (entry?.kind !== "widget") return false;
    const limits = this.apps_service.get(entry.app_id)?.widget_size;
    if (!limits) return false;
    const next = clamp_widget_size(size, limits);
    if (next.w === entry.size.w && next.h === entry.size.h) return true;
    await this.folder.write_widget_size(name, next);
    return true;
  }

  public async set_widget_style(name: string, style: WidgetStyle): Promise<boolean> {
    const entry = this.folder.get(name);
    if (entry?.kind !== "widget") return false;
    if (entry.style !== style) await this.folder.write_widget_style(name, style);
    return true;
  }

  public async remove_item(name: string): Promise<void> {
    await this.folder.remove(name);
  }

  public async rename_item(name: string, new_name: string): Promise<void> {
    if (!this.folder.get(name) || name === new_name) return;

    // Carry the place over to the new name before the rename's reload reads the layout, so the icon doesn't jump.
    const swap = (names: string[]) => names.map((entry) => (entry === name ? new_name : entry));
    const layout = {
      order: swap(this.arranged.home.map((entry) => entry.name)),
      dock: swap(this.arranged.dock.map((entry) => entry.name)),
    };
    this.layout = layout;
    await this.save(layout);
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
