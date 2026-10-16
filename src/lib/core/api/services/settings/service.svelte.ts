import type { Appearance, FileDefaults, SavedTheme, SettingsService as ISettingsService, Taskbar, Theme, Wallpaper } from "./type";
import { TaskbarPosition } from "./type";
import { BRAND_DARK } from "./themes";
import { DEFAULT_APPEARANCE, RADIUS_SCALE } from "./appearance";
import type { FilesService, Kernel } from "$lib/core/api";
import { LatestWriter } from "../files/latest-writer";
import { write_var_lib } from "../desktop/folder.svelte";
import {
  DEFAULT_WALLPAPER,
  SETTINGS_PATH,
  SETTINGS_VERSION,
  parse_settings,
  serialize_settings,
  take_legacy_settings,
  take_v0_settings,
  WALLPAPER_DIRECTORY,
  WALLPAPER_DIRECTORY_NAME,
} from "./persistence";
import { settings_shell } from "./shell";

export class SettingsService implements ISettingsService {
  name = "SettingsService";
  description = "Theme, taskbar and file defaults (persisted)";
  inspector = () => import("./inspector.svelte");
  shell = () => settings_shell(this);

  to_string(): string {
    return `SettingsService: taskbar ${this.taskbar.position}, theme ${JSON.stringify(this.theme)}`;
  }

  public taskbar = $state<Taskbar>({ position: TaskbarPosition.BOTTOM, pinned: [] });
  public theme = $state<Theme>({ ...BRAND_DARK });
  public file_defaults = $state<FileDefaults>({});
  public wallpaper = $state<Wallpaper>(DEFAULT_WALLPAPER);
  public saved_themes = $state<SavedTheme[]>([]);
  public appearance = $state<Appearance>({ ...DEFAULT_APPEARANCE });

  private files_service!: FilesService;
  private dispose_effects?: () => void;

  private writer = new LatestWriter(() => this.files_service, SETTINGS_PATH, "settings");

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
  }

  async init() {
    const file = await this.files_service.get_file(SETTINGS_PATH);
    // The legacy copies are consumed either way, so they can't resurrect old values later.
    const legacy = take_legacy_settings();
    const v0 = take_v0_settings();
    const saved = file ? parse_settings(await file.text()) : (legacy ?? v0);
    if (saved) {
      this.theme = saved.theme;
      this.taskbar = saved.taskbar;
      this.file_defaults = saved.file_defaults;
      this.wallpaper = saved.wallpaper;
      this.saved_themes = saved.saved_themes;
      this.appearance = saved.appearance;
    }
    this.prune_wallpapers().catch((error) => console.error("[SettingsService] Failed to prune wallpapers", error));

    this.dispose_effects = $effect.root(() => {
      $effect(() => {
        for (const [key, value] of Object.entries(this.theme)) {
          document.documentElement.style.setProperty(`--${key.replaceAll("_", "-")}`, value);
        }
        // Native controls (scrollbars, pickers, date inputs) and light-dark() follow the palette, not the OS preference.
        document.documentElement.style.colorScheme = background_lightness() > 0.6 ? "light" : "dark";
      });

      $effect(() => {
        const root = document.documentElement;
        root.style.setProperty("--radius-scale", String(RADIUS_SCALE[this.appearance.radius]));
        if (this.appearance.motion === "off") root.dataset.motion = "off";
        else delete root.dataset.motion;
      });

      $effect(() => {
        this.writer.write(
          serialize_settings({
            version: SETTINGS_VERSION,
            theme: this.theme,
            taskbar: this.taskbar,
            file_defaults: this.file_defaults,
            wallpaper: this.wallpaper,
            saved_themes: this.saved_themes,
            appearance: this.appearance,
          })
        );
      });
    });
  }

  public async set_wallpaper_image(source: string | File): Promise<void> {
    const file = typeof source === "string" ? await this.files_service.get_file(source) : source;
    if (!file) throw new Error(`${source} doesn't exist`);
    // A fresh name each time, so choosing an image with the same name still changes the path the desktop watches.
    const name = `${Date.now().toString(36)}-${file.name}`;
    await write_var_lib(this.files_service, WALLPAPER_DIRECTORY_NAME, name, file);

    const previous = this.wallpaper.kind === "image" ? this.wallpaper : null;
    this.wallpaper = { kind: "image", path: `${WALLPAPER_DIRECTORY}/${name}`, fit: previous?.fit ?? "fill", dim: previous?.dim ?? 0, blur: previous?.blur ?? 0 };
    await this.prune_wallpapers();
  }

  /** Deletes copies the wallpaper no longer uses (replaced, or a preset was chosen since). */
  private async prune_wallpapers(): Promise<void> {
    const directory = await this.files_service.get_directory(WALLPAPER_DIRECTORY);
    if (!directory) return;
    const current = this.wallpaper.kind === "image" ? this.wallpaper.path : null;
    for (const item of await this.files_service.list(directory)) {
      if (`${WALLPAPER_DIRECTORY}/${item.name}` !== current) await this.files_service.delete_entry(directory, item.name);
    }
  }

  destroy() {
    this.dispose_effects?.();
  }
}

/** Lightness of the applied background, whatever syntax the theme wrote it in (hex, oklch(from …), color-mix). */
function background_lightness(): number {
  const probe = document.createElement("span");
  probe.style.color = "oklch(from var(--background) l c h)";
  document.body.append(probe);
  const lightness = Number(/oklch\(\s*([\d.]+)/.exec(getComputedStyle(probe).color)?.[1] ?? 0);
  probe.remove();
  return lightness;
}
