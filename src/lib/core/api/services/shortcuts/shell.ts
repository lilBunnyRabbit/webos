import { define_command } from "../shell/define";
import type { ShellContribution } from "../shell/type";
import type { DialogsService } from "../dialogs/type";
import ShortcutsDialog from "$lib/core/components/dialogs/shortcuts-dialog.svelte";
import { format_keys } from "./keys";
import type { ShortcutsService } from "./type";

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
        *run() {
          for (const shortcut of shortcuts.list()) {
            yield {
              $type: "shortcut",
              keys: format_keys(shortcut.keys, shortcuts.mac).join(" "),
              label: shortcut.label,
              action: "command" in shortcut ? shortcut.command : shortcut.window ? "window" : "app",
            };
          }
        },
      }),
      define_command({
        id: "shortcuts sheet",
        description: "Show the keyboard shortcuts cheat sheet",
        run: () => void dialogs().show(ShortcutsDialog, {}),
      }),
    ],
  };
}
