import type {
  AppsService,
  DesktopWindowsService,
  DialogsService,
  MobileWindowsService,
  KeyShortcut,
  UiService,
  WindowId,
  WindowsService,
} from "$lib/core/api";
import ShortcutsDialog from "$lib/core/components/dialogs/shortcuts-dialog.svelte";
import { WindowFlag } from "../windows/type";
import { ShortcutCategory } from "./type";
import { UiOverlay } from "../ui/type";

interface Services {
  windows: () => WindowsService;
  apps: () => AppsService;
  dialogs: () => DialogsService;
  ui: () => UiService;
}

// Shape checks, not platform checks: the registered windows service decides what makes sense (ADR-016).
const is_desktop = (windows: WindowsService): windows is DesktopWindowsService => "snap" in windows;
const is_mobile = (windows: WindowsService): windows is MobileWindowsService => "go_home" in windows;

/** The OS shortcuts (ADR-017 revision). Registered by the service's `init()`. */
export function default_shortcuts({ windows, apps, dialogs, ui }: Services): KeyShortcut[] {
  const focused = () => windows().get_focused();
  const with_focused = (action: (id: WindowId) => void) => () => {
    const id = focused();
    if (id) action(id);
  };

  /** Windows newest first, minimized ones included: they're still running. */
  const recent = () =>
    windows()
      .sorted_list(([, a], [, b]) => b.order - a.order)
      .map(([id]) => id);

  function bring(id: WindowId | undefined) {
    if (!id) return;
    const service = windows();
    if (service.get(id)?.flags.has(WindowFlag.MINIMIZED)) service.toggle_minimize(id);
    else service.focus(id);
  }

  const shortcuts: KeyShortcut[] = [
    {
      id: "window.close",
      keys: "alt+shift+w",
      label: "Close window",
      category: ShortcutCategory.WINDOW,
      when: () => focused() !== null,
      run: with_focused((id) => windows().close(id)),
    },
    {
      id: "window.minimize",
      keys: "alt+shift+down",
      label: is_mobile(windows()) ? "Go home" : "Minimize window",
      category: ShortcutCategory.WINDOW,
      when: () => focused() !== null,
      run: with_focused((id) => windows().toggle_minimize(id)),
    },
    {
      id: "window.previous",
      keys: "alt+`",
      label: "Switch to the previous window",
      category: ShortcutCategory.WINDOW,
      when: () => windows().list().length > 1 || (focused() === null && windows().list().length > 0),
      // From home nothing is focused, so the newest window is the one to bring back.
      run: () => bring(focused() ? recent()[1] : recent()[0]),
    },
    {
      id: "window.cycle",
      keys: "alt+shift+`",
      label: "Cycle through windows",
      category: ShortcutCategory.WINDOW,
      when: () => windows().list().length > 1,
      run: () => bring(recent().at(-1)),
    },
    {
      id: "desktop.show",
      keys: "alt+shift+d",
      label: is_mobile(windows()) ? "Go home" : "Show desktop",
      category: ShortcutCategory.WINDOW,
      run: () => {
        const service = windows();
        if (is_mobile(service)) return service.go_home();
        for (const id of service.list()) {
          if (!service.get(id)?.flags.has(WindowFlag.MINIMIZED)) service.toggle_minimize(id);
        }
      },
    },
    {
      id: "apps.launcher",
      keys: "mod+k",
      label: "Search apps",
      category: ShortcutCategory.APPS,
      run: () => ui().toggle(UiOverlay.LAUNCHER),
    },
    {
      id: "apps.settings",
      keys: "mod+,",
      label: "Open Settings",
      category: ShortcutCategory.APPS,
      run: () => apps().launch("settings"),
    },
    {
      id: "system.notifications",
      keys: "alt+shift+n",
      label: "Notifications",
      category: ShortcutCategory.SYSTEM,
      run: () => ui().toggle(UiOverlay.NOTIFICATIONS),
    },
    {
      id: "system.shortcuts",
      keys: "mod+/",
      label: "Keyboard shortcuts",
      category: ShortcutCategory.SYSTEM,
      run: () => void dialogs().show(ShortcutsDialog, {}),
    },
  ];

  if (is_desktop(windows())) {
    const desktop = () => windows() as DesktopWindowsService;
    const snap = (zone: "left" | "right") =>
      with_focused((id) => {
        const instance = desktop().get(id);
        // Maximize wins when rendering, so a snap from maximized has to leave it first.
        if (instance?.flags.has(WindowFlag.MAXIMIZED)) desktop().toggle_maximize(id);
        desktop().snap(id, instance?.snap_zone === zone ? null : zone);
      });

    shortcuts.push(
      {
        id: "window.maximize",
        keys: "alt+shift+up",
        label: "Maximize or restore window",
        category: ShortcutCategory.WINDOW,
        when: () => focused() !== null,
        run: with_focused((id) => desktop().toggle_maximize(id)),
      },
      {
        id: "window.snap_left",
        keys: "alt+shift+left",
        label: "Snap window left",
        category: ShortcutCategory.WINDOW,
        when: () => focused() !== null,
        run: snap("left"),
      },
      {
        id: "window.snap_right",
        keys: "alt+shift+right",
        label: "Snap window right",
        category: ShortcutCategory.WINDOW,
        when: () => focused() !== null,
        run: snap("right"),
      }
    );
  }

  return shortcuts;
}
