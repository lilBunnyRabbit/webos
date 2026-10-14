# ADR-034: App Extension Points: Commands, Badge, Widgets
**Date:** 2026-10-14
**Status:** Implemented

Extends [ADR-008](./008-app-props-validation.md) (`define_app`), [ADR-022](./022-desktop-folder.md) (desktop as a folder) and [ADR-033](./033-shell.md) (shell). First consumer: Quick Notes. [Brainstorm](../brainstorm/2026-10-14_quick-notes.md).

## Context

Apps reach the OS only through a window. Three things Quick Notes needs happen with no window open:

- capturing a note from the Terminal or palette (`note buy milk`);
- showing the open todo count on its icon;
- a sticky note living on the desktop.

ADR-033 deferred app commands; the ROADMAP lists them ("App-registered commands").

## Decision

`define_app` gains three optional fields. Discovery stays one eager glob of `index.ts`.

### `shell`: app commands

```ts
define_app({
  shell: {
    commands: [define_command({ id: "note", …, run: async (c) => (await import("./shell")).note(c) })],
    completers: { note: … },
    values: { note: { … } },
  },
});
```

- The same `ShellContribution` shape services return. AppsService merges every app's into its own `shell()`; ShellService is unchanged.
- Ids, args and descriptions are eager so the palette lists them. `run()` dynamic-imports the logic.
- Ids are free (`note`, not `quick-notes note`). If one clashes with a service command, **the service wins** and the app command is dropped with a warning.
- Commands are global: they run with no window. Window-scoped app commands (shortcuts as commands) are not part of this.

### `badge`: a count on the app's icon

```ts
define_app({ badge: () => todos.open }); // number | null
```

- A sync function, read inside the shell UI's `$derived` wherever the app's icon shows: desktop icons, taskbar buttons, the start menu and drawer, mobile tiles and dock.
- **It does no work until it is shown.** The app backs it with `createSubscriber` (`svelte/reactivity`): reading starts when the first effect reads it, and stops when the last icon unmounts. No boot cost, no polling.
- `null` or `0` shows nothing.

### `widget`: things on the desktop

```ts
define_app({ widget: () => import("./widget.svelte") }); // Component<{ props, size }>
```

- A widget is a `.widget` file in `/home/Desktop`: JSON `{ app, props, w, h }`. It's a new `DesktopItem` kind that spans `w × h` cells, positioned by its top-left cell in `layout.json` like any item.
- Because it's a file, Explorer, the shell and the desktop's own actions delete, rename and move it.
- **Mobile v1 hides widgets.** Home pages flow with no gaps, and spanning tiles break that.

## Alternatives Considered

- **Commands from a `notes` kernel service.** Rejected: a service for one user app.
- **Commands as a lazy `shell: () => import()`.** Rejected: every module would load at boot anyway.
- **Commands from a `shell.ts` glob.** Rejected: a second, implicit discovery path.
- **Command ids forced under an app prefix.** Rejected: that kills one-line capture.
- **A lazy badge module loaded by AppsService at boot.** Rejected: it runs app code for every badge app even when no icon is visible.
- **A badge through WindowHandle `set_badge`.** Rejected: there's no badge while the app is closed.
- **Widgets as entries in `layout.json`.** Rejected: invisible to Explorer, and a second item model.
- **A note `.md` on the Desktop becoming a sticky.** Rejected: magic.
- **Stickies as small windows, or as a PINNED window flag.** Rejected by the owner in favour of the desktop surface.

## Consequences

- Each app's command schemas sit in the boot bundle.
- Grid occupancy, drag and collision in DesktopService learn multi-cell items.
- Two apps can still clash on a command id; the last one discovered wins, with a warning.
- Window-scoped app commands stay on the ROADMAP.

## Revisions

- **2026-10-14:** Quick Notes renamed its commands to a `quno` group (`quno q`, `quno t`, `quno ls`, …), so they match the owner's CLI. Ids stay free; an app picking its own group noun is not the forced prefix rejected above.
