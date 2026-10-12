# UiService

Key `ui` · Depends on: none · ADR: [ADR-028](../../adrs/028-ui-service.md) · Source: `src/lib/core/api/services/ui/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

The shell's overlay state, so a service (shortcuts now, a command palette later) can open what used to be component state: the launcher (the desktop start menu, the mobile app drawer) and the mobile running-apps switcher.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `overlay` | `readonly UiOverlay \| null` | `"launcher"` or `"switcher"`. One at a time |
| `open` | `(overlay) => void` | Replaces whatever was open |
| `close` | `() => void` | |
| `toggle` | `(overlay) => void` | Opens it, or closes it when it's the open one |

## State

`overlay`: `$state`. Not persisted; starts `null`.

## Lifecycle

None.

## Who reads it

| Where | How |
|-------|-----|
| `taskbar/start-menu.svelte` | Mirrors both ways: the popover's `toggle` event writes `open` / `close` (light dismiss and Esc included), and an effect calls `showPopover()` / `hidePopover()` when `overlay` changes. The popover keeps its own open state too, for mounting the contents |
| `mobile/mobile-shell.svelte` | `overlay` is its layer: `launcher` renders the app drawer, `switcher` the card row. It closes the overlay when an app comes on screen |
| ShortcutsService | Mod+K toggles `launcher` |

## Known gaps

- Desktop has no switcher; `"switcher"` does nothing there.
