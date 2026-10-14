# ADR-028: UI Service
**Date:** 2026-10-12
**Status:** Implemented

> **Revision 2026-10-14: back** (owner, [brainstorm](../brainstorm/2026-10-14_os-back.md))
> - UiService owns back for both platforms: `back(): boolean` runs the chain overlay, top system dialog or menu, focused window's top sheet, the app's `on_back`, then (mobile) home. Non-dismissible dialogs swallow it. The nav bar Back calls it.
> - It also owns the browser-history guard. One same-URL entry is pushed on the next `pointerup` or `keydown` (Chrome skips entries pushed without user activation), and `popstate` runs `back()` and disarms it. It always re-arms, so WebOS doesn't leave while the user is interacting. Hash links (`#/`) are left to the router.
> - Dependencies become `windows`, `dialogs` (no cycle: neither depends on `ui`). It's no longer "overlay state, nothing else".

> **Revision 2026-10-12: notifications overlay** ([brainstorm](../brainstorm/2026-10-12_notification-center.md)). `UiOverlay.NOTIFICATIONS` opens the notification center: the tray popover on desktop, the switcher on mobile (where the list lives). Alt+Shift+N toggles it.

## Context

The shortcuts service registers the OS shortcuts in `init()` (ADR-012 revision). Two of them open shell overlays whose state was local to a component: the desktop start menu (a native popover's own open state) and, on mobile, the app drawer and the running-apps switcher (`layer` in `mobile-shell.svelte`, ADR-016). A service can't reach component state. [Brainstorm](../brainstorm/2026-10-12_shortcuts.md).

## Decision

A `ui` kernel service holds the shell's overlay state, nothing else:

```ts
interface UiService extends IService {
  /** The open overlay: the launcher (start menu / app drawer) or the mobile switcher. One at a time. */
  readonly overlay: UiOverlay | null;
  open(overlay: UiOverlay): void;
  close(): void;
  toggle(overlay: UiOverlay): void;
}
type UiOverlay = "launcher" | "switcher";
```

- No dependencies. Not persisted: overlays start closed.
- The desktop start menu mirrors it: the popover's `toggle` event writes it, and an effect shows or hides the popover when it changes.
- The mobile shell reads it instead of its local `layer`. It still closes the overlay when an app comes on screen.
- The cheat sheet is a system dialog, not an overlay here.

## Alternatives Considered

- Launcher state on DesktopService and the switcher on MobileWindowsService. Rejected: UI state next to folder and window logic.
- Everything on the windows service. Rejected: the launcher isn't about windows.
- Shells register the shortcuts that need their state. Rejected by the owner: the defaults stay in one list.

## Consequences

- Anything can open the launcher or switcher: shortcuts now, the command palette later.
- Reverses the mobile-shell decision that the switcher is shell-local (ADR-016 revision).
- The name `shell` stays free for ADR-007's terminal.
