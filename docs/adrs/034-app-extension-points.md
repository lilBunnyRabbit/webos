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
- *Revised 2026-10-17: `shell` is now `() => import("./commands")`, loaded on first use. See Revisions.*
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

- **2026-10-18:** The manifest's display text is lazy too (ADR-049, 3.0.0). `description`, `keywords`, `pitch` and `authors` left `AppConfig` / `AppManifest` for a sibling `meta.ts` behind `meta: () => import("./meta")`, the same loader shape as `shell`, `highlights` and `preview`. AppsService loads every app's once when the desktop is idle after boot, into one `app-meta` chunk; `meta_ready` and `meta(id)` read it. `app list` and `app info` await it before yielding a description or authors; completion still uses id and name only. Entry chunk: 168.2 → 154.4 KB gz, with Algorithms' catalog out of its props.

- **2026-10-17:** App shell contributions are lazy (owner's decision, app wave 7 brainstorm). Manifests load at boot, and the apps' commands were ~10 KB gz of the ~33 KB they weighed, pushing the entry chunk over its 190 KB budget. `shell` is now `() => import("./commands")`; the module's default export is the `ShellContribution` (`export default { … } satisfies ShellContribution`). The eager object form is gone. `ShellContribution` gains `lazy?: () => Promise<ShellContribution>`, and AppsService puts every app's module behind its own `lazy`. ShellService's `load()` resolves every `lazy` once, through one shared promise; a run and completion await it, and Terminal, the palette, shortcut lists and App Library's details call it when they open. A shortcut bound to a command the shell doesn't know yet holds its key, loads, then picks again. Lazy parts merge first, so a service still wins a command id clash and its completers and values win over an app's. App Library's "Has commands" filter checks for a `shell` loader; the details list reads the shell's registry. The one-time install migration (ADR-040) loads the modules itself to match history lines. Entry chunk: 190.5 → 182.3 KB gz.

- **2026-10-15:** Default widgets come from the manifest. `define_app` gains `default_widget?: boolean`: the app's widget is placed on every desktop once, at `widget_size.default`, on first boot and on desktops set up before; removing it sticks. Core no longer names Game Hub, and a deleted app drops out of the list. The pass runs after boot; `init()` doesn't await it.
- **2026-10-15:** Widgets resize (owner's decision). `define_app` gains `widget_size: { min, max, default }` (cells, spans 1–8, `min ≤ default ≤ max`, checked at definition). A grip on the widget's bottom-right corner drags the size in whole cells, clamped to the range and refused when it would leave the grid or cover another item; Shift+arrows on a selected widget do the same from the keyboard. The `.widget` file stays the source of truth: release writes `w`/`h` back. A stored size outside the range is clamped when read, without rewriting the file. `pin_widget`'s `size` became optional and defaults to `widget_size.default`; an app without `widget_size` keeps its file's size and gets no grip.
- **2026-10-14:** Quick Notes renamed its commands to a `quno` group (`quno q`, `quno t`, `quno ls`, …), so they match the owner's CLI. Ids stay free; an app picking its own group noun is not the forced prefix rejected above.
