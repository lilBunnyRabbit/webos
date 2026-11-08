# ADR-101: Immersive windows
**Date:** 2026-11-08
**Status:** Implemented

## Context
On a phone in landscape, the app toolbar and the mobile nav bar take about 215 px. The owner wants a fuller screen with an easy way back ([brainstorm](../brainstorm/2026-11-08_immersive-windows.md)).

## Decision
- **WindowHandle:** gains a reactive `immersive: boolean` and `set_immersive(on: boolean)`. `WindowsService` holds the state per window; it is not persisted.
- **Mobile shell:** while the focused window is immersive, the nav bar is hidden and the window fills the screen. The system back first leaves immersive.
- **Desktop shell:** an immersive window is maximized with its title bar hidden. Leaving restores the previous frame.
- **Browser fullscreen:** entering requests `document.documentElement.requestFullscreen()` when available and the call comes from a user gesture or a command. A `fullscreenchange` out of fullscreen leaves immersive. Where the API is missing (iPhone), only the WebOS bars hide.
- **Exit pill:** a small floating ⤢ button rendered by the shell in the window's top-right corner. Its box is published on the window element as `--immersive-inset-top` and `--immersive-inset-right` (0 when not immersive), like a notch's safe area.
- **Apps:** read `handle.immersive` to hide their own toolbar, and lay out around the inset variables. The play2d kit's game frames do both, and add a ⤢ Full screen toolbar button.
- **Window menu:** every window menu gets "Full screen".
- **Shell:** `win immersive [on|off|toggle] [window]`. F11 is bound to it in `shortcuts/defaults.ts`.

## Alternatives Considered
- **Kit-only browser fullscreen of the board:** no iPhone, and dialogs, menus and toasts outside the element are hidden.
- **Per-app only:** each game would repeat it.
- **Exit through the pause card, or a draggable pill:** two exit paths, or a pill that still covers things.

## Consequences
- A public API change to WindowHandle (documented in `docs/system/app-model` / windows service pages).
- Every kit HUD honours one more inset.
- Session restore never restores immersive.

> **Revision 2026-11-08: build** (decided within scope while implementing; [windows](../system/services/windows.md#immersive), [window](../system/shell/window.md#immersive), [mobile](../system/shell/mobile.md#immersive))
> - **State is a window flag,** `WindowFlag.IMMERSIVE`, like the guide's: transient, so the session's `SESSION_FLAGS` already leave it out. `set_immersive(id, on)` sits in `BaseWindowsService`, shared by both implementations, and returns the new state.
> - **Desktop "maximized" is a render state, not the `MAXIMIZED` flag:** the window is drawn at the window area's full size with no title bar while the flag is set, and its bounds, snap zone and maximized flag are left alone, so leaving restores the frame without storing one. The taskbar stays, as decided ("maximized").
> - **Fullscreen sync:** one `fullscreenchange` listener leaves every immersive window when the page itself leaves fullscreen; one effect exits the page's fullscreen when no window is immersive any more (exit button, back, close). Nothing is requested when another element is already fullscreen (Music Visualizer).
> - **Mobile:** another app coming on screen, or home, takes the on-screen app out of immersive (like a phone app sent to the background), so the nav bar is never hidden behind a non-immersive screen.
> - **Back order:** the guide first (it covers the app), then immersive, then the app's `on_back`.
> - **Pop out:** a popped-out window can't enter (`set_immersive` refuses, `win immersive` says so) and popping out leaves immersive first.
> - **Window menus:** there was no title bar menu; the build adds one on right-click of the title bar (Full screen, Minimize, Maximize or Restore, Close) and puts Full screen in the taskbar item's one-window menu too. On mobile the switcher card's long press opens a menu with Full screen and Close.
> - **Solo tabs** get the same: the header hides and `solo-window.svelte` shows the exit button.
> - **Kit:** `FullScreenButton` and `ImmersiveNotch` in `$kit/components/play2d`; the kit `Toolbar` adds `--immersive-inset-right` to its right padding so any app's toolbar clears the button; HUD rows clear the corner with CSS (`min-h` of the top inset, so their measured height still sets the camera's top inset). Lunar Lander's canvas profile strip moves down by the measured top inset.
> - **Esc** isn't bound by WebOS: it reaches the page as before (a game's pause), and the browser's own Esc leaving fullscreen is what leaves immersive.
> - **Review fixes:** immersive is left only when the fullscreen stack empties, so an app's own element fullscreen on top of the page's doesn't end it; minimizing (and Show desktop) and, on mobile, any new window coming on screen leave it; F11 is claimed in text fields and behind system dialogs so Chrome's own fullscreen doesn't stack.
