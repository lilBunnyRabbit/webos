import { z } from "zod";
import { arg, ArgKind } from "../shell/arg";
import { define_command } from "../shell/define";
import { ShellError, type ShellContribution } from "../shell/type";
import { THEME_PRESETS } from "./themes";
import type { SettingsService, ThemeToken } from "./type";

export function settings_shell(settings: SettingsService): ShellContribution {
  const active = () =>
    THEME_PRESETS.find(({ theme }) => Object.entries(theme).every(([token, value]) => settings.theme[token as ThemeToken] === value));

  return {
    completers: {
      [ArgKind.THEME]: () => THEME_PRESETS.map((preset) => ({ value: preset.name, detail: preset === active() ? "active" : undefined })),
    },
    values: {
      theme: {
        columns: ["name", "active"],
        cell: (theme, column) => (column === "active" ? (theme.active ? "●" : "") : String(theme[column])),
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
        description: "Theme presets",
        yields: "theme",
        *run() {
          const current = active();
          for (const preset of THEME_PRESETS) yield { $type: "theme", name: preset.name, active: preset === current };
        },
      }),
      define_command({
        id: "theme set",
        description: "Switch to a theme preset",
        args: z.object({ name: z.array(arg.kind(ArgKind.THEME)).min(1).describe("Preset name; quotes or spaces both work") }),
        positional: ["name"],
        run({ args }) {
          const name = args.name.join(" ").toLowerCase();
          const preset = THEME_PRESETS.find((candidate) => candidate.name.toLowerCase() === name);
          if (!preset) throw new ShellError(`no theme "${args.name.join(" ")}". Try theme list`);
          settings.theme = { ...preset.theme };
        },
      }),
    ],
  };
}
