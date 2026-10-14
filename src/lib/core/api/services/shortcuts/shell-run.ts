import ShortcutsDialog from "$lib/core/components/dialogs/shortcuts-dialog.svelte";
import type { DialogsService } from "../dialogs/type";
import { format_keys } from "./keys";
import type { ShortcutsService } from "./type";

export function* list(shortcuts: ShortcutsService) {
  for (const shortcut of shortcuts.list()) {
    yield {
      $type: "shortcut",
      keys: format_keys(shortcut.keys, shortcuts.mac).join(" "),
      label: shortcut.label,
      action: "command" in shortcut ? shortcut.command : shortcut.window ? "window" : "app",
    };
  }
}

export const sheet = (dialogs: DialogsService) => void dialogs.show(ShortcutsDialog, {});
