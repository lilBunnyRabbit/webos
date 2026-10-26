import type { AnalyticsConsent, Appearance, FileDefaults, FontChoice, LiveOptions, SavedTheme, SettingsService as ISettingsService, SpeechSettings, Taskbar, Theme, Wallpaper } from "./type";
import { FontRole, TaskbarPosition, TaskbarSize } from "./type";
import { BRAND_DARK } from "./themes";
import { DEFAULT_APPEARANCE, RADIUS_SCALE, SHADOW_STRENGTH, TEXT_SCALE } from "./appearance";
import { BUILTIN_FONTS, DEFAULT_FONT, DEFAULT_FONT_NAMES, FONT_DIRECTORY, FONT_DIRECTORY_NAME, font_label, is_font_file_name, same_font } from "./fonts";
import type { FilesService, Kernel } from "$lib/core/api";
import { NotificationType, type NotificationsService } from "../notifications/type";
import { PATHS } from "../files/hierarchy";
import { base_name } from "../files/path";
import { untrack } from "svelte";
import type { FaceSource } from "$lib/core/utils/font-loader";
import { LatestWriter } from "../files/latest-writer";
import { write_var_lib } from "../desktop/folder.svelte";
import {
  DEFAULT_SPEECH,
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
import { apply_consent } from "$lib/core/utils/analytics";

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
  public analytics = $state<AnalyticsConsent>("unasked");
  public speech = $state<SpeechSettings>({ ...DEFAULT_SPEECH });

  private files_service!: FilesService;
  private dispose_effects?: () => void;
  /** Bumped when a role's file is replaced under the same name, so its faces load again. */
  private font_epochs = $state<Record<FontRole, number>>({ sans: 0, mono: 0 });
  private font_requests: Record<FontRole, number> = { sans: 0, mono: 0 };
  private font_faces: Record<FontRole, FontFace[]> = { sans: [], mono: [] };
  private font_applied: Record<FontRole, { choice: FontChoice; epoch: number } | null> = { sans: null, mono: null };

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
      this.analytics = saved.analytics;
      this.speech = saved.speech;
    }
    this.prune_wallpapers().catch((error) => console.error("[SettingsService] Failed to prune wallpapers", error));

    this.dispose_effects = $effect.root(() => {
      let probed: string | null = null;
      $effect(() => {
        for (const [key, value] of Object.entries(this.theme)) {
          document.documentElement.style.setProperty(`--${key.replaceAll("_", "-")}`, value);
        }
        // Native controls (scrollbars, pickers, date inputs) and light-dark() follow the palette, not the OS preference.
        // The probe forces a style recalc; colours that don't reference other tokens can't change without changing here.
        const pair = `${this.theme.background} ${this.theme.foreground}`;
        if (pair === probed && !pair.includes("var(")) return;
        probed = pair;
        // By text polarity, not background lightness: dark text on a mid-tone background is a light palette.
        document.documentElement.style.colorScheme = lightness("foreground") < lightness("background") ? "light" : "dark";
      });

      $effect(() => {
        const root = document.documentElement;
        root.style.setProperty("--radius-scale", String(RADIUS_SCALE[this.appearance.radius]));
        root.style.setProperty("--shadow-strength", String(SHADOW_STRENGTH[this.appearance.shadow]));
        root.style.setProperty("--text-scale", String(TEXT_SCALE[this.appearance.text]));
        if (this.appearance.motion === "off") root.dataset.motion = "off";
        else delete root.dataset.motion;
      });

      for (const role of Object.values(FontRole)) {
        $effect(() => {
          const choice = $state.snapshot(this.appearance.font[role]);
          const epoch = this.font_epochs[role];
          untrack(() => {
            const last = this.font_applied[role];
            if (last && last.epoch === epoch && same_font(last.choice, choice)) return;
            this.font_applied[role] = { choice, epoch };
            void this.apply_font(role, choice);
          });
        });
      }

      $effect(() => apply_consent(this.analytics));

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
            analytics: this.analytics,
            speech: this.speech,
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

  public async use_font(role: FontRole, source: string | File): Promise<void> {
    const file = typeof source === "string" ? await this.files_service.get_file(source) : source;
    if (!file) throw new Error(`${source} doesn't exist`);
    const name = typeof source === "string" ? base_name(source) : source.name;
    if (!is_font_file_name(name)) throw new Error(`${name} isn't a TTC, TTF, OTF, WOFF or WOFF2 font`);
    let directory = await this.files_service.get_directory(FONT_DIRECTORY);
    if (!directory) {
      const etc = await this.files_service.get_directory(PATHS.etc);
      if (!etc) throw new Error(`${PATHS.etc} is missing`);
      directory = await this.files_service.create_directory(etc, FONT_DIRECTORY_NAME);
    }
    await this.files_service.create_file(directory, name, { content: file, overwrite: true });
    this.appearance.font = { ...this.appearance.font, [role]: { kind: "file", name } };
    for (const other of Object.values(FontRole)) {
      if (same_font(this.appearance.font[other], { kind: "file", name })) this.font_epochs[other]++;
    }
  }

  public async remove_font(name: string): Promise<void> {
    const directory = await this.files_service.get_directory(FONT_DIRECTORY);
    if (directory) await this.files_service.delete_entry(directory, name);
    const font = { ...this.appearance.font };
    for (const role of Object.values(FontRole)) {
      if (same_font(font[role], { kind: "file", name })) font[role] = DEFAULT_FONT;
    }
    this.appearance.font = font;
  }

  public async installed_fonts(): Promise<string[]> {
    const directory = await this.files_service.get_directory(FONT_DIRECTORY);
    if (!directory) return [];
    const items = await this.files_service.list(directory);
    return items
      .filter((item) => item.kind === "file" && is_font_file_name(item.name))
      .map((item) => item.name)
      .sort((a, b) => a.localeCompare(b));
  }

  private async font_sources(choice: Exclude<FontChoice, { kind: "default" }>): Promise<FaceSource[]> {
    if (choice.kind === "builtin") {
      const { fetch_faces } = await import("$lib/core/utils/font-loader");
      return fetch_faces(BUILTIN_FONTS[choice.id].faces);
    }
    const file = await this.files_service.get_file(`${FONT_DIRECTORY}/${choice.name}`);
    if (!file) throw new Error(`${choice.name} isn't in ${FONT_DIRECTORY} any more`);
    const { file_faces } = await import("$lib/core/utils/font-loader");
    return file_faces(new Uint8Array(await file.arrayBuffer()));
  }

  private drop_faces(role: FontRole) {
    for (const face of this.font_faces[role]) document.fonts.delete(face);
    this.font_faces[role] = [];
  }

  // Loaded off the boot path: the page paints in Inter and Hack and swaps once the faces are in. A failed font
  // puts a file choice back on the default, so a broken file doesn't keep failing at every boot.
  private async apply_font(role: FontRole, choice: FontChoice): Promise<void> {
    const request = ++this.font_requests[role];
    const root = document.documentElement;
    if (choice.kind === "default") {
      this.drop_faces(role);
      root.style.removeProperty(`--app-font-${role}`);
      return;
    }
    try {
      const sources = await this.font_sources(choice);
      const { load_faces } = await import("$lib/core/utils/font-loader");
      const family = `webos-${role}-${request}`;
      const faces = await load_faces(family, sources);
      if (request !== this.font_requests[role]) return;
      this.drop_faces(role);
      for (const face of faces) document.fonts.add(face);
      this.font_faces[role] = faces;
      root.style.setProperty(`--app-font-${role}`, `"${family}", "${DEFAULT_FONT_NAMES[role]}"`);
    } catch (error) {
      if (request !== this.font_requests[role]) return;
      console.error(`[SettingsService] Font ${font_label(choice, role)} failed`, error);
      // A built-in only fails to download (offline): keep the choice so it loads next time. A missing file stays missing.
      if (choice.kind === "file" && same_font(this.appearance.font[role], choice)) this.appearance.font = { ...this.appearance.font, [role]: DEFAULT_FONT };
      this.kernel.service<NotificationsService>("notifications").notify("settings", {
        type: NotificationType.ERROR,
        title: `Couldn't load ${font_label(choice, role)}`,
        message: `${error instanceof Error ? error.message : String(error)}. Using ${DEFAULT_FONT_NAMES[role]} instead.`,
      });
    }
  }

  destroy() {
    this.dispose_effects?.();
    for (const role of Object.values(FontRole)) {
      this.font_requests[role]++;
      this.font_applied[role] = null;
      this.drop_faces(role);
      document.documentElement.style.removeProperty(`--app-font-${role}`);
    }
  }
}

/** Lightness of an applied theme colour, whatever syntax the theme wrote it in (hex, oklch(from …), color-mix). */
function lightness(token: "background" | "foreground"): number {
  const probe = document.createElement("span");
  probe.style.color = `oklch(from var(--${token}) l c h)`;
  document.body.append(probe);
  const lightness = Number(/oklch\(\s*([\d.]+)/.exec(getComputedStyle(probe).color)?.[1] ?? 0);
  probe.remove();
  return lightness;
}
