import type { SettingsService as ISettingsService, Taskbar, Theme } from "./type";
import { TaskbarPosition } from "./type";

/*
TODO:
- import/export settings
*/

export class SettingsService implements ISettingsService {
  name = "SettingsService";
  description = "SettingsService";

  to_string(): string {
    return `SettingsService: ${this.taskbar.position} ${this.theme.background} ${this.theme.foreground} ${this.theme.primary} ${this.theme.secondary} ${this.theme.accent}`;
  }

  public taskbar = $state<Taskbar>({ position: TaskbarPosition.BOTTOM });
  public theme = $state<Theme>(this.load_theme());

  constructor() {
    this.theme = this.load_theme();

    // TODO: revisit
    // Auto-update CSS variables whenever theme changes
    if (typeof window !== "undefined") {
      $effect.root(() => {
        $effect(() => {
          console.log("theme updated", this.theme);
          // This tracks ALL properties of theme
          Object.entries(this.theme).forEach(([key, value]) => {
            document.documentElement.style.setProperty(`--${key}`, value);
          });
        });
      });
    }
  }

  private update_theme(partial_theme: Partial<Theme>): void {
    console.log("theme updated", partial_theme);

    // This tracks ALL properties of theme
    Object.entries(partial_theme).forEach(([key, value]) => {
      document.documentElement.style.setProperty(`--${key}`, value);
    });
  }

  private load_theme(): Theme {
    const computed = getComputedStyle(document.documentElement);

    return {
      background: computed.getPropertyValue("--background").trim(),
      foreground: computed.getPropertyValue("--foreground").trim(),
      primary: computed.getPropertyValue("--primary").trim(),
      secondary: computed.getPropertyValue("--secondary").trim(),
      accent: computed.getPropertyValue("--accent").trim(),
    };
  }
}
