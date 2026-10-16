import { find_saved, THEME_PRESETS, type SavedTheme } from "$lib/core/api";
import type { WindowHandle } from "$lib/core/contexts/app";

/** Asks for a saved theme's name: not empty, not a preset's, not another saved theme's (`current` is the one renamed). */
export function ask_theme_name(
  win: Pick<WindowHandle, "prompt">,
  saved: SavedTheme[],
  { message, confirm_label, current }: { message: string; confirm_label: string; current?: string }
): Promise<string | null> {
  return win.prompt(message, {
    initial: current ?? `Theme ${saved.length + 1}`,
    confirm_label,
    validate: (value) => {
      const name = value.trim().toLowerCase();
      if (!name) return "Give it a name";
      if (THEME_PRESETS.some((preset) => preset.name.toLowerCase() === name)) return "A preset has that name";
      const taken = find_saved(saved, name);
      if (taken && taken.name.toLowerCase() !== current?.toLowerCase())
        return "You already have a theme with that name";
      return null;
    },
  });
}
