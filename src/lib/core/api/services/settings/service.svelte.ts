import type { Appearance, FileDefaults, LiveOptions, SavedTheme, SettingsService as ISettingsService, Taskbar, Theme, Wallpaper } from "./type";
import { TaskbarPosition, TaskbarSize } from "./type";
import { BRAND_DARK } from "./themes";
import { DEFAULT_APPEARANCE, RADIUS_SCALE, SHADOW_STRENGTH, TEXT_SCALE } from "./appearance";
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

  public taskbar = $state<Taskbar>({ position: TaskbarPosition.BOTTOM, pinned: [], size: TaskbarSize.MEDIUM, auto_hide: false, seconds: false });
  public theme = $state<Theme>({ ...BRAND_DARK });
  public file_defaults = $state<FileDefaults>({});
  public wallpaper = $state<Wallpaper>(DEFAULT_WALLPAPER);
  public saved_themes = $state<SavedTheme[]>([]);
  public appearance = $state<Appearance>({ ...DEFAULT_APPEARANCE });
  public live_options = $state<LiveOptions>({});

  private files_service!: FilesService;
  private dispose_effects?: () => void;

  private writer = new LatestWriter(() => this.files_service, SETTINGS_PATH, "settings", { delay: 300 });

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
  }

  async init() {
    const file = await this.files_service.get_file(SETTINGS_PATH);
    // The legacy copies are consumed either way, so they can't resurrect old values later.
    const legacy = take_legacy_settings();
    const v0 = take_v0_settings();
    const text = file ? await file.text() : null;
    this.writer.seed(text);
    const saved = text !== null ? parse_settings(text) : (legacy ?? v0);
    if (saved) {
      this.theme = saved.theme;
      this.taskbar = saved.taskbar;
      this.file_defaults = saved.file_defaults;
      this.wallpaper = saved.wallpaper;
      this.saved_themes = saved.saved_themes;
      this.appearance = saved.appearance;
      this.live_options = saved.live_options;
    }
    this.prune_wallpapers().catch((error) => console.error("[SettingsService] Failed to prune wallpapers", error));

    this.dispose_effects = $effect.root(() => {
      let probed: string | null = null;
      $effect(() => {
        for (const [key, value] of Object.entries(this.theme)) {
          document.documentElement.style.setProperty(`--${key.replaceAll("_", "-")}`, value);
        }
        // Native controls (scrollbars, pickers, date inputs) and light-dark() follow the palette, not the OS preference.
        // The probe forces a style recalc; a background that doesn't reference other tokens can't change without changing here.
        const background = this.theme.background;
        if (background === probed && !background.includes("var(")) return;
        probed = background;
        document.documentElement.style.colorScheme = background_lightness() > 0.6 ? "light" : "dark";
      });

      $effect(() => {
        const root = document.documentElement;
        root.style.setProperty("--radius-scale", String(RADIUS_SCALE[this.appearance.radius]));
        root.style.setProperty("--shadow-strength", String(SHADOW_STRENGTH[this.appearance.shadow]));
        root.style.setProperty("--text-scale", String(TEXT_SCALE[this.appearance.text]));
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
            live_options: this.live_options,
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
