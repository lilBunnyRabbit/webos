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

## Next session topics

- Proper implementation: WindowsService-level state (taskbar, session, Activity Monitor), shell command, manifest opt-in or not
- Dialogs, menus and toasts inside the mini window (they open in the main tab today); shortcuts inside it
- Keeping in-memory state across the move (dirty windows)
- `window.open` route for more than one window, after cross-tab sync
