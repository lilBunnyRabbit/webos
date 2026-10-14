# ShortcutsService

Key `shortcuts` · Depends on: `windows`, `dialogs`, `shell` · ADR: [ADR-012](../../adrs/012-shortcuts-service.md), [ADR-017](../../adrs/017-keyboard-shortcuts-strategy.md) (both revised 2026-10-12, [brainstorm](../../brainstorm/2026-10-12_shortcuts.md)), [ADR-033](../../adrs/033-shell.md) (OS shortcuts run commands) · Source: `src/lib/core/api/services/shortcuts/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Keyboard shortcuts as data: a registry and one `keydown` listener on `window`. It owns the OS shortcuts (registered in `init()`), which are key bindings for [shell](shell.md) commands, and takes window-scoped ones from apps. Keys that act on a focused element (an Explorer row's F2, a desktop icon's Enter, a menu's arrows) are not here: they stay on that element and run first.

| File | Contents |
|------|----------|
| `type.ts` | `ShortcutsService`, `KeyShortcut` (`CommandShortcut \| RunShortcut`), `ListedShortcut`, `ShortcutCategory` |
| `keys.ts` | Pure: `normalize`, `code_key`, `event_keys`, `has_command_modifier`, `format_keys`, `is_mac`. Unit-tested |
| `defaults.ts` | `DEFAULT_SHORTCUTS`: the OS set, keys to command lines |
| `shell.ts` | Its shell contribution: `shortcuts`, `shortcuts sheet` |
| `service.svelte.ts` | Registry and dispatcher |

The name is `KeyShortcut` because `Shortcut` is the `.desktop` file type in `services/apps`.

## Public API

```ts
type KeyShortcut = CommandShortcut | RunShortcut;
interface CommandShortcut {   // the OS set
  id: string;                 // "window.close"
  keys: string;               // "alt+shift+w", "mod+k"
  category: "window" | "apps" | "system" | "app";
  command: string;            // "win close": live only while shell.available(command)
  label?: string;             // the command's description when absent
}
interface RunShortcut {       // apps, until they can register commands
  id: string; keys: string; category: …; label: string;
  window?: WindowId;          // live only while that window is focused; absent = global
  run: () => void;
  when?: () => boolean;       // checked at key time; false lets the key through
}
```

| Member | Signature | Notes |
|--------|-----------|-------|
| `register` | `(shortcut) => () => void` | Normalizes `keys`, appends, returns the disposer (made for `$effect`). Both run untracked, so an effect that registers doesn't subscribe to the list it writes (that looped forever: Paint, 0.19.0). Same keys in the same scope: `console.warn` and the newer one wins |
| `list` | `() => ListedShortcut[]` | Everything registered whose command exists, labels resolved, for the cheat sheet and the inspector. A command the platform lacks (`win snap` on mobile) drops out |
| `mac` | `readonly boolean` | `is_mac()` once: `userAgentData.platform` (else `navigator.platform`) matching mac, iOS, iPhone or iPad. Decides what `mod` means and how keys display |

### Keys

`"mod+shift+k"`: modifiers in any order (`normalize` sorts them to `mod, ctrl, alt, shift, meta`), then one key. `mod` is Cmd on macOS/iOS and Ctrl elsewhere; on macOS `ctrl` is the Control key, elsewhere `meta` is Win. Keys come from `KeyboardEvent.code` (`KeyW` → `w`, `ArrowUp` → `up`, `Backquote` → `` ` ``, `Slash` → `/`, `Comma` → `,`, `F2` → `f2`, …), so the layout and Option-modified characters on macOS don't change what matches. `format_keys(keys, mac)` gives the display parts: `⌘ ⌃ ⌥ ⇧` on macOS, `Ctrl Alt Shift Win` elsewhere, arrows as `↑ ↓ ← →`.

## State

`shortcuts`: `$state.raw<KeyShortcut[]>`, replaced on every register and dispose. Raw on purpose: a deep proxy would hand out copies, and the disposer finds its entry by identity.

## Lifecycle

`init()`: registers `DEFAULT_SHORTCUTS` (keeping their disposers) and adds the `keydown` listener. `destroy()`: removes the listener and disposes the defaults.

## Dispatch

On every `keydown`, in order:

1. Skip if `defaultPrevented` (a local handler took it) or `isComposing` (IME).
2. Skip if a system dialog is open (`dialogs.system.length > 0`): it's modal.
3. `event_keys(event, mac)`; skip a lone modifier.
4. In a text field (`input`, `textarea`, `select`, contenteditable), only combinations with `mod`, `ctrl`, `alt` or `meta` fire, so typing is never eaten.
5. Candidates with these keys, newest first. A shortcut for the focused window wins over a global one. A command shortcut must have `shell.available(command)`, a run shortcut `when()`.
6. `preventDefault()` synchronously, then `run()` or `shell.execute(command)` (async; a failure becomes an error toast).

## Default shortcuts

Each is a command line; what it does, and whether it exists on this platform, is the command's business ([shell](shell.md#contributions)). Labels default to the command's description, so mobile shows "Go home" where the windows service says so.

| Id | Keys | Command | Desktop | Mobile |
|----|------|---------|---------|--------|
| `window.close` | Alt+Shift+W | `win close` | ✓ | ✓ |
| `window.minimize` | Alt+Shift+↓ | `win minimize` | Minimize | Go home |
| `window.previous` | Alt+\` | `win previous`: the most recent other window (from home: the newest), un-minimizing it | ✓ | ✓ |
| `window.cycle` | Alt+Shift+\` | `win cycle`: the least recently used window | ✓ | ✓ |
| `window.reopen` | Alt+Shift+T | `win reopen` (session); available while something was closed | ✓ | ✓ |
| `desktop.show` | Alt+Shift+D | `win desktop` | Show desktop | Go home |
| `window.maximize` | Alt+Shift+↑ | `win maximize` | ✓ | — |
| `window.gather` | Alt+Shift+G | `win gather` | ✓ | — |
| `window.snap_left` / `window.snap_right` | Alt+Shift+← / → | `win snap left` / `win snap right`; the same zone again unsnaps | ✓ | — |
| `apps.launcher` | Mod+K | `ui launcher` | ✓ | ✓ |
| `apps.terminal` | Alt+Shift+↵ | `app launch terminal`: always a new window | ✓ | ✓ |
| `apps.settings` | Mod+, | `app launch settings` | ✓ | ✓ |
| `apps.quick_note` | Alt+Shift+Q | `quno q`, Quick Notes' app command (ADR-034): with no text it opens the capture box | ✓ | ✓ |
| `system.notifications` | Alt+Shift+N | `ui notifications` | ✓ | ✓ |
| `system.shortcuts` | Mod+/ | `shortcuts sheet` | ✓ | ✓ |

The window commands are `available()` only while a window is open, so with nothing open the key falls through. Without ids they act on the focused window and fail ("no window is focused") when there is none. Minimize, maximize, snap, show desktop and un-minimizing run inside `view_transition()`.

## Cheat sheet

`components/dialogs/shortcuts-dialog.svelte`: a `bg-background-lighter` card, `min(28rem, 100vw − 2rem)` wide, max `min(36rem, 100dvh − 2rem)` tall, scrolling. Header with a keyboard icon tile and a close button. Groups in order: This app (`app`), Windows, Apps, System; empty groups are hidden. Window-scoped shortcuts show only for the focused window. Each row: label, then `Kbd` chips from `format_keys`.

## Registering from an app

```ts
const { window_id } = get_app_context();
const shortcuts = kernel.service<ShortcutsService>("shortcuts");
$effect(() =>
  shortcuts.register({ id: "my-app.save", keys: "mod+s", label: "Save", category: ShortcutCategory.APP, window: window_id, run: save })
);
```

## Divergence from ADR

ADR-012's "app" scope, `unregister(id)`, `get_conflicts`, the `enabled` toggle, `mac_keys`, remapping in Settings and ADR-017's tiers aren't built; the revisions record why. ADR-017's `Ctrl+Shift+` table is replaced by Alt+Shift.

## Known gaps

- No remapping. Where Alt+Shift switches the keyboard layout (some Windows setups), it can't be fixed.
- Mod+, on macOS Chrome may open Chrome's own settings before the page sees it; untested on a real Mac keyboard.
- No app uses window-scoped shortcuts yet; apps' own keys (Tic-Tac-Toe Ctrl+Z, Sprite Extract, GIF Player) are local handlers and don't show in the cheat sheet.
- Snap only covers halves; quarters and top/bottom have no keys.
