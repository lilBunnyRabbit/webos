import type { FileDefaults, SettingsService as ISettingsService, Taskbar, Theme } from "./type";
import { TaskbarPosition } from "./type";
import { BRAND_DARK } from "./themes";
import type { FilesService, Kernel } from "$lib/core/api";
import { LatestWriter } from "../files/latest-writer";
import {
  SETTINGS_PATH,
  SETTINGS_VERSION,
  parse_settings,
  serialize_settings,
  take_legacy_settings,
  take_v0_settings,
} from "./persistence";

export class SettingsService implements ISettingsService {
  name = "SettingsService";
  description = "Theme, taskbar and file defaults (persisted)";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `SettingsService: taskbar ${this.taskbar.position}, theme ${JSON.stringify(this.theme)}`;
  }

  public taskbar = $state<Taskbar>({ position: TaskbarPosition.BOTTOM });
  public theme = $state<Theme>({ ...BRAND_DARK });
  public file_defaults = $state<FileDefaults>({});

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
    }

    this.dispose_effects = $effect.root(() => {
      $effect(() => {
        for (const [key, value] of Object.entries(this.theme)) {
          document.documentElement.style.setProperty(`--${key.replaceAll("_", "-")}`, value);
        }
        // Native controls (scrollbars, pickers, date inputs) and light-dark() follow the palette, not the OS preference.
        document.documentElement.style.colorScheme = background_lightness() > 0.6 ? "light" : "dark";
      });

      $effect(() => {
        this.writer.write(
          serialize_settings({
            version: SETTINGS_VERSION,
            theme: this.theme,
            taskbar: this.taskbar,
            file_defaults: this.file_defaults,
          })
        );
      });
    });
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
