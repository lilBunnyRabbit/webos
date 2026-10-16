import { z } from "zod";
import { arg, ArgKind } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution } from "../shell/type";
import { is_dark, generate_theme, DEFAULT_GENERATE } from "./random-theme";
import { derive_theme, THEME_PRESETS } from "./themes";
import { find_saved, with_saved, without_saved } from "./saved-themes";
import type { SettingsService, Theme, ThemeToken } from "./type";

export function settings_shell(settings: SettingsService): ShellContribution {
  const matches = (theme: Theme) => Object.entries(theme).every(([token, value]) => settings.theme[token as ThemeToken] === value);
  const active = () => THEME_PRESETS.find(({ theme }) => matches(theme)) ?? settings.saved_themes.find(({ theme }) => matches(theme));
  /** Presets, then saved themes: every name `theme set` takes. */
  const all = () => [...THEME_PRESETS.map(({ name, theme }) => ({ name, theme, saved: false })), ...settings.saved_themes.map(({ name, theme }) => ({ name, theme, saved: true }))];
  const preset_named = (name: string) => THEME_PRESETS.find((preset) => preset.name.toLowerCase() === name.trim().toLowerCase());

  return {
    completers: {
      [ArgKind.THEME]: () => {
        const current = active();
        return all().map(({ name, saved }) => ({ value: name, detail: current?.name === name ? "active" : saved ? "saved" : undefined }));
      },
    },
    values: {
      theme: {
        columns: ["name", "saved", "active"],
        cell: (theme, column) => (column === "active" ? (theme.active ? "●" : "") : column === "saved" ? (theme.saved ? "saved" : "") : String(theme[column])),
        text: (theme) => `${theme.active ? "●" : " "} ${String(theme.name)}`,
      },
    },
    commands: [
      define_command({
        id: "theme get",
        description: "The active theme",
        run: () => active()?.name ?? "Custom",
      }),
      define_command({
        id: "theme list",
        description: "Theme presets, then your saved themes",
        yields: "theme",
        *run() {
          const current = active();
          for (const { name, saved } of all()) yield { $type: "theme", name, saved, active: current?.name === name };
        },
      }),
      define_command({
        id: "theme random",
        description: "A new theme that keeps light or dark and picks colours that go together",
        run() {
          const base = generate_theme({ ...DEFAULT_GENERATE, mode: is_dark(settings.theme) ? "dark" : "light" });
          settings.theme = derive_theme(base);
          return base;
        },
      }),
      define_command({
        id: "theme set",
        description: "Switch to a theme preset or a saved theme",
        args: z.object({ name: z.array(arg.kind(ArgKind.THEME)).min(1).describe("Theme name; quotes or spaces both work") }),
        positional: ["name"],
        run({ args }) {
          const name = args.name.join(" ");
          const theme = preset_named(name)?.theme ?? find_saved(settings.saved_themes, name)?.theme;
          if (!theme) throw new ShellError(`no theme "${name}". Try theme list`);
          settings.theme = { ...theme };
        },
      }),
      define_command({
        id: "theme save",
        description: "Save the current theme under a name; the same name replaces it",
        args: z.object({ name: z.array(z.string()).min(1).describe("Name; quotes or spaces both work") }),
        positional: ["name"],
        run({ args }) {
          const name = args.name.join(" ").trim();
          if (!name) throw new ShellError("give the theme a name");
          if (preset_named(name)) throw new ShellError(`"${name}" is a preset's name`);
          settings.saved_themes = with_saved(settings.saved_themes, name, settings.theme);
          return `Saved ${name}`;
        },
      }),
      define_command({
        id: "theme delete",
        description: "Delete a saved theme",
        args: z.object({ name: z.array(arg.kind(ArgKind.THEME)).min(1).describe("Saved theme name") }),
        positional: ["name"],
        available: () => settings.saved_themes.length > 0,
        run({ args }) {
          const name = args.name.join(" ");
          if (!find_saved(settings.saved_themes, name)) throw new ShellError(preset_named(name) ? "presets can't be deleted" : `no saved theme "${name}"`);
          settings.saved_themes = without_saved(settings.saved_themes, name);
        },
      }),
    ],
  };
}
