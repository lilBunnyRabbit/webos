import { define_command } from "../shell/define";
import type { ShellContribution } from "../shell/type";
import type { DialogsService } from "../dialogs/type";
import type { ShortcutsService } from "./type";

const logic = () => import("./shell-run");

export function shortcuts_shell(shortcuts: ShortcutsService, dialogs: () => DialogsService): ShellContribution {
  return {
    values: {
      shortcut: {
        columns: ["keys", "label", "action"],
        text: (shortcut) => `${String(shortcut.keys).padEnd(16)} ${String(shortcut.label)}`,
      },
    },
    commands: [
      define_command({
        id: "shortcuts",
        description: "Keyboard shortcuts in effect",
        yields: "shortcut",
        async *run() {
          yield* (await logic()).list(shortcuts);
        },
      }),
      define_command({
        id: "shortcuts sheet",
        description: "Show the keyboard shortcuts cheat sheet",
        run: async () => (await logic()).sheet(dialogs()),
      }),
    ],
  };
}
