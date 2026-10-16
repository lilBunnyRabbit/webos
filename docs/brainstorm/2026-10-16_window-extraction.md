# Window extraction

**Date:** 2026-10-16 · **Participants:** owner, Claude

## Context

Roadmap item "Window extraction" (Needs Brainstorm): pop one app out of the page into a small always-on-top window. The owner assumed cross-tab file sync had to come first. That holds for `window.open` popups (each is a separate page with its own kernel), not for Document Picture-in-Picture, which shares the opener's JS realm. The owner asked for a quick proof of concept before the Showcasing and Installed apps sessions.

## Decisions (proof of concept)

- **Mechanism: remount in PiP.** A new Svelte root in the PiP document with the window's contexts. Moving the live DOM was rejected: Svelte 5 delegates events to the mount target and the main `document` (`svelte/src/internal/client/render.js`), so every click inside the moved nodes would be dead.
- **State: local in `window.svelte`.** No WindowsService API, no flag, nothing persisted. Owner: "keep it simple now we will do a proper implementation".
- **Shell: nothing yet.**
- **Scope: any app, desktop only.** The button shows where the API exists; dirty windows can't pop out because the remount would drop unsaved work.

## Key takeaways

- PiP gives one extra window per tab, which matches "only one app outside".
- Same realm means services, files and settings stay live with no sync layer.

## Action items

- [x] POC: titlebar Pop out / Bring back, style copy + theme mirroring, placeholder in the frame. Worked in Chrome (Clock and Hopsprite popped out, clicks and live theme inside), then reverted by the owner: the proper version comes after Showcasing features and Installed apps
- [ ] Proper implementation, starting from the POC's shape below

## How the POC worked

- `documentPictureInPicture.requestWindow({ width, height })` at the window's bounds; TypeScript needs an ambient `.d.ts` for it.
- Clone every `<style>` and stylesheet `<link>` from `<head>` into the PiP document; mirror `<html>`'s attributes (the theme's inline custom properties) with a `MutationObserver` until `pagehide`.
- `mount(Host, { target: pip.document.body, props: { window_id }, context: getAllContexts() })` from `window.svelte`, where the host renders `WindowContent` in an `h-dvh w-dvw bg-background` box. `pagehide` unmounts it.
- The frame swaps `WindowContent` for an `EmptyState` ("Open in a mini window", Bring back), so the app runs once. The window's destroy closes the PiP window.
- Titlebar button (Phosphor `PictureInPicture`), pressed while out, disabled while dirty.

## Proper implementation (second session)

Owner's grill answers, recorded as [ADR-043](../adrs/043-window-extraction.md).

| Question | Decision | Rejected |
|---|---|---|
| Route | **Document Picture-in-Picture only.** Same realm, one mini window per tab | PiP with a `target` arg for popups later (speculative shape); `window.open` popups (each a separate kernel, needs cross-tab sync first) |
| Who owns "popped out" | **New `ExtractService`, desktop only** (registered in `platform_services`); shared code checks `kernel.services.has("extract")` | Same service on both platforms with `supported: false`; a `WindowFlag.EXTRACTED` on DesktopWindowsService; local state in `window.svelte` (POC: taskbar, Activity Monitor and shell couldn't see it) |
| In-page frame while out | **Hidden like minimized**, taskbar item marked; click focuses the mini window, its menu has Bring back | Placeholder in the frame (POC) |
| Which apps | **Any app**, at its current bounds | Manifest opt-in `mini: { width, height }`; any app with a manifest size hint |
| Menus, dialogs, sheets, toasts | **Window's own overlays in the mini window**, toasts in the tab. Sheets follow `WindowSheets`; menus and confirms get an `origin` | Everything in the tab (POC: menus open in the other window); bring the app back on any overlay |
| How a dialog knows its home | **DialogsService infers it**: the anchor's `ownerDocument`, else the focused window when it's the popped-out one | Callers pass `{ origin }` (every app call site changes) |
| Unsaved work | **Pop out disabled while dirty** ("Save first") | Ask to save first (the await spends the click's user activation, so `requestWindow` would fail); pop anyway with a warning toast |
| Session | Saved as a normal window. Not a choice: PiP needs user activation, so it can't reopen at boot | |
| Shell | **`win pop [window]` and `win back`**, Alt+Shift+P runs `win pop`. Enter and shortcut keydowns count as user activation | Commands only; nothing |

### Takeaways

- The owner questioned whether this needs a service at all. The case for: four readers (taskbar, Activity Monitor, shell, session) and one owner for the PiP window's lifecycle (style copy, theme mirror, `pagehide`). The mount itself still happens in `window.svelte` so the app inherits its contexts.
- Desktop only means no mobile service and no mobile bundle cost, at the price of a `has` check in shared code.
- Remounting stays: in-memory state of clean apps (a game in progress, a running timer without storage) resets on pop out. Accepted.

## Next session topics

- `window.open` route for more than one window, after cross-tab sync
- Keeping in-memory state across the move
- Shortcuts typed inside the mini window
