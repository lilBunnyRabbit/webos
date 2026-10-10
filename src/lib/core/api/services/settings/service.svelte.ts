import type { SettingsService as ISettingsService, Taskbar, Theme } from "./type";
import { TaskbarPosition } from "./type";
import { BRAND_DARK } from "./themes";

export class SettingsService implements ISettingsService {
  name = "SettingsService";
  description = "SettingsService";

  to_string(): string {
    return `SettingsService: taskbar ${this.taskbar.position}, theme ${JSON.stringify(this.theme)}`;
  }

  public taskbar = $state<Taskbar>({ position: TaskbarPosition.BOTTOM });
  public theme = $state<Theme>({ ...BRAND_DARK });

  constructor() {
    if (typeof window !== "undefined") {
      $effect.root(() => {
        $effect(() => {
          for (const [key, value] of Object.entries(this.theme)) {
            document.documentElement.style.setProperty(`--${key}`, value);
          }
        });
      });
    }
  }
}
