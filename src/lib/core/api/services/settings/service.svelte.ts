import type { FileDefaults, SettingsService as ISettingsService, Taskbar, Theme } from "./type";
import { TaskbarPosition } from "./type";
import { BRAND_DARK } from "./themes";
import { SETTINGS_VERSION, load_settings, save_settings } from "./persistence";

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

  private dispose_effects?: () => void;

  init() {
    const saved = load_settings();
    if (saved) {
      this.theme = saved.theme;
      this.taskbar = saved.taskbar;
      this.file_defaults = saved.file_defaults;
    }

    this.dispose_effects = $effect.root(() => {
      $effect(() => {
        for (const [key, value] of Object.entries(this.theme)) {
          document.documentElement.style.setProperty(`--${key}`, value);
        }
      });

      $effect(() => {
        save_settings({
          version: SETTINGS_VERSION,
          theme: this.theme,
          taskbar: this.taskbar,
          file_defaults: this.file_defaults,
        });
      });
    });
  }

  destroy() {
    this.dispose_effects?.();
  }
}
