import type { AppId, AppProps, AppsService, FilesService, OpenOptions } from "$lib/core/api";
import { parse_shortcut, serialize_shortcut, shortcut_label, SHORTCUT_EXTENSION } from "../apps/shortcut";
import { file_extension } from "../apps/associations";
import { PATHS } from "../files/hierarchy";
import { available_name } from "../files/opfs";
import { join_path, split_path } from "../files/path";
import type { DesktopItem } from "./type";

/** Shortcuts written into an empty desktop on first boot. */
export const DEFAULT_SHORTCUTS: AppId[] = ["settings", "file-explorer"];

interface DesktopFolderOptions {
  files: () => FilesService;
  apps: () => AppsService;
  /** Reads the layout file that belongs to the owner. `null` when it doesn't exist yet. */
  read_layout: () => Promise<string | null>;
  /** Called once for an empty folder that has never had a layout: write the default shortcuts and a layout. */
  seed: (folder: DesktopFolder) => Promise<void>;
  /** Hands the layout text to the owner in the same tick the entries change, so both update together. */
  loaded: (layout: string | null) => void;
}

/**
 * The `/home/Desktop` folder as items (ADR-022): reading, watching, seeding and the file operations both the desktop
 * grid and the mobile home share (ADR-016). The owner keeps the layout; this keeps the folder.
 */
export class DesktopFolder {
  public entries = $state<DesktopItem[]>([]);

  private dispose_watch?: () => void;
  private reload_id = 0;

  constructor(private options: DesktopFolderOptions) {}

  async init(): Promise<void> {
    await this.reload();

    this.dispose_watch = $effect.root(() => {
      let first = true;
      $effect(() => {
        this.options.files().revision(PATHS.desktop);
        // The first run only subscribes; init() already loaded the folder.
        if (first) {
          first = false;
          return;
        }
        this.reload().catch((error) => console.error("[DesktopFolder] Failed to reload the desktop", error));
      });
    });
  }

  destroy(): void {
    this.dispose_watch?.();
  }

  public async handle(): Promise<FileSystemDirectoryHandle> {
    const folder = await this.options.files().get_directory(PATHS.desktop);
    if (!folder) throw new Error(`${PATHS.desktop} is missing`);
    return folder;
  }

  public get(name: string): DesktopItem | undefined {
    return this.entries.find((entry) => entry.name === name);
  }

  public names(): string[] {
    return this.entries.map((entry) => entry.name);
  }

  private async reload(): Promise<void> {
    const id = ++this.reload_id;
    const files = this.options.files();
    const folder = await this.handle();
    const items = await files.list(folder);

    const layout = await this.options.read_layout();
    const visible = items.filter((item) => !item.name.startsWith("."));

    // An empty folder with no layout file has never been set up: seed it once, then read what was written. The layout
    // file the seed writes stops this from running again.
    if (layout === null && visible.length === 0) {
      await this.options.seed(this);
      return this.reload();
    }

    const entries: DesktopItem[] = [];
    for (const item of visible) {
      if (item.kind === "directory") {
        entries.push({ kind: "directory", name: item.name });
        continue;
      }

      const shortcut =
        file_extension(item.name) === SHORTCUT_EXTENSION
          ? parse_shortcut(await (await item.handle.getFile()).text())
          : null;
      entries.push(
        shortcut
          ? { kind: "shortcut", name: item.name, label: shortcut_label(item.name), ...shortcut }
          : { kind: "file", name: item.name, type: item.type ?? "" }
      );
    }

    // A newer reload started while this one was reading; its result wins.
    if (id !== this.reload_id) return;
    this.entries = entries;
    this.options.loaded(layout);
  }

  /** Writes `{App name}.desktop`, auto-renamed on a clash. Returns the file name, or `null` for an unknown app. */
  public async write_shortcut(app_id: AppId, props?: AppProps): Promise<string | null> {
    const manifest = this.options.apps().get(app_id);
    if (!manifest) return null;

    const folder = await this.handle();
    const name = await available_name(folder, `${manifest.name}${SHORTCUT_EXTENSION}`);
    await this.options.files().create_file(folder, name, { content: serialize_shortcut({ app_id, props }) });
    return name;
  }

  public async remove(name: string): Promise<void> {
    const item = this.get(name);
    if (!item) return;
    await this.options.files().delete_entry(await this.handle(), item.name, { recursive: item.kind === "directory" });
  }

  public async rename(name: string, new_name: string): Promise<void> {
    await this.options.files().rename_entry(await this.handle(), name, new_name);
  }

  public async create_folder(name: string): Promise<void> {
    await this.options.files().create_directory(await this.handle(), name);
  }

  public open(item: DesktopItem, options?: OpenOptions): void {
    const path = join_path(split_path(PATHS.desktop), item.name);
    switch (item.kind) {
      case "shortcut":
      case "file":
        // Shortcuts go through open() too, so a missing target app gets the same "Broken shortcut" toast as in Explorer.
        this.options
          .apps()
          .open(path, options)
          .catch((error) => console.error(`[DesktopFolder] Failed to open ${item.name}`, error));
        return;
      case "directory":
        this.options.apps().launch("file-explorer", { path });
    }
  }
}

/** Writes a file into a `/var/lib` subfolder, creating the subfolder on first use. */
export async function write_var_lib(
  files: FilesService,
  directory: string,
  file: string,
  content: string
): Promise<void> {
  let handle = await files.get_directory(`${PATHS.var_lib}/${directory}`);
  if (!handle) {
    const var_lib = await files.get_directory(PATHS.var_lib);
    if (!var_lib) throw new Error(`${PATHS.var_lib} is missing`);
    handle = await files.create_directory(var_lib, directory);
  }
  await files.create_file(handle, file, { content, overwrite: true });
}
