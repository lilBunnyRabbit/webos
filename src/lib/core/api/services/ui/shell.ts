import { view_transition } from "$lib/core/utils/view-transition";
import { define_command } from "../shell/define";
import type { ShellContribution } from "../shell/type";
import { UiOverlay, type UiService } from "./type";

export function ui_shell(ui: UiService, mobile: boolean): ShellContribution {
  const commands = [
    define_command({
      id: "ui launcher",
      description: "Open or close the app launcher",
      run: () => ui.toggle(UiOverlay.LAUNCHER),
    }),
    define_command({
      id: "ui notifications",
      description: "Open or close the notification center",
      run: () => ui.toggle(UiOverlay.NOTIFICATIONS),
    }),
  ];
  if (mobile) {
    commands.push(
      define_command({
        id: "ui switcher",
        description: "Open or close the running apps",
        run: () => view_transition(() => ui.toggle(UiOverlay.SWITCHER)),
      })
    );
  }
  return { commands };
}
