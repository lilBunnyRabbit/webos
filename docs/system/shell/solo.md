# Solo shell

Source: `src/lib/core/components/solo/` · ADR: [ADR-047](../../adrs/047-solo-app-open.md) · [Brainstorm](../../brainstorm/2026-10-18_isolated-app-open.md)

The shell a `#/solo/{id}?{props}` link gets, on every platform: one app, full page, no desktop, taskbar, dock or other windows. `load_shell(platform, mode)` (`components/platform-shell.ts`) imports it when `kernel.mode` is `solo`; its own chunk. Platform services still follow detection, so a phone runs `MobileWindowsService` and apps keep their touch behaviour. Every service boots; `apps`, `session` and `version` are swapped for solo versions ([kernel](../kernel.md)).

## Layout

```
solo-shell.svelte        flex column, h-dvh, safe-area insets left/right
├─ header                the window's app icon, title (or app name), unsaved dot; Open WebOS (primary link, new tab)
├─ main                  isolate
│  ├─ solo-window.svelte the first window: app context, WindowContent at zoom 1, its sheets; no chrome
│  ├─ EmptyState         closed: "{App} is closed" + Reopen · broken link: "This link can't open", or "This link needs a newer WebOS" + Update and reload
│  └─ ToastArea          top-right (desktop) or top-centre (mobile)
└─ DialogsHost           dropdown on desktop, sheet on mobile
```

The header pads the top safe area. Touch makes it 52 px tall (`pointer-coarse:h-13`).

## Interactions

| Action | Result |
|--------|--------|
| Open WebOS | `<a target="_blank">` to `router.link_for(window)`, the same `#/app/` link Copy link gives. The solo tab stays as it is, so a half-filled form isn't lost. With no window: the link's app link, or the bare OS for a broken link |
| Close the app (its own close, `windows.close`) | Empty state with Reopen, which launches the link's route again |
| Launch another app, open a file | Opens nothing; toast with Open WebOS ([apps](../services/apps.md#solo-mode)) |
| Broken link | Runs `version.check()` once (solo never polls). With a newer build out, the empty state names both versions and offers Update and reload (`apply_update()`), since an app or prop newer than this cached build looks like a broken link; while checking it says so |
| Reload | Same app again: the solo hash isn't cleared |
| Browser back | Closes the top sheet or dialog, else runs the app's back ([ui](../services/ui.md#back)); with nothing to take it, the next back leaves the tab |
| Change the hash | Reload ([router](../services/router.md#handling-a-link)) |

## Known gaps

- Open WebOS starts the app from its launch props, not its current state.
- The app's own chrome (Forms' Build/Answers modes, Open/Save) shows as in the OS.
- Shortcuts that open shell overlays (launcher, palette) do nothing visible: the solo shell renders none.
