# ADR-043: Window Extraction
**Date:** 2026-10-16
**Status:** Accepted

## Context

The owner wants to pop one app out of the WebOS tab into a small always-on-top browser window: a Clock, a Pomodoro or a video kept in view while working in another tab. A proof of concept worked and was reverted on purpose. It used Document Picture-in-Picture, copied the page's styles in, mirrored the theme and remounted the app there, with all state local to `window.svelte` ([brainstorm](../brainstorm/2026-10-16_window-extraction.md)).

Moving the live DOM isn't an option: Svelte 5 delegates events to the mount target and the main `document`, so clicks inside moved nodes would be dead. The app has to remount in the other document.

## Decision

**Route.** Document Picture-in-Picture only. `documentPictureInPicture.requestWindow()` shares the opener's JS realm, so the kernel, files and settings stay live with no sync layer. One mini window per tab. Requires user activation (a click or a keydown). An ambient `.d.ts` declares the API.

**ExtractService** (key `extract`, desktop only, registered in `platform_services`, deps `windows`):

```ts
interface ExtractService extends IService {
  readonly current: WindowId | null;
  readonly document: Document | null;
  pop(id: WindowId): Promise<boolean>;
  bring_back(): void;
}
```

- `pop` refuses a dirty window or a missing API, brings back any window already out, opens the PiP window at the window's bounds, clones `<head>` styles and stylesheet links, and mirrors `<html>`'s attributes (the theme's custom properties) with a `MutationObserver`.
- The PiP window's `pagehide` brings the app back. Closing the window closes the PiP window.
- Shared code (Activity Monitor, the session) checks `kernel.services.has("extract")`, since `kernel.service()` throws for a missing key.

**Mounting.** `window.svelte` mounts a mini host into `extract.document.body` while `extract.current === id`, with `getAllContexts()`, so the app gets its window handle and storage. The host renders `WindowContent`, `WindowSheets` and a `DialogsHost` filtered to that window. The in-page frame is hidden the way a minimized window is, so the app runs once.

**Overlays.**
- Window sheets are already bound to their window, so they render in the mini window.
- `DialogEntry` gains `origin: WindowId | null`, set inside `DialogsService.show`: the anchor's `ownerDocument` is the PiP document, else the focused window is the popped-out one. DialogsService looks up `extract` at call time, with no init dependency. The tab's host skips entries whose `origin` is out; the mini host shows only those.
- Kit popovers live in the component tree, so they open in the mini window already.
- Toasts stay in the tab.

**Taskbar.** The window's item is marked while out. Clicking it focuses the PiP window; its menu has Bring back.

**Titlebar.** A Pop out button (Phosphor `PictureInPicture`) on every app, desktop only. It's disabled while the window is dirty ("Save first"), because the remount drops unsaved work.

**Session.** A popped-out window is saved as a normal window. PiP can't reopen at boot without user activation, so it comes back in its frame.

**Shell** (ExtractService `shell.ts`):
- `win pop [window]` pops the focused window by default.
- `win back` brings it back.
- Alt+Shift+P runs `win pop`.

Terminal and palette Enter and shortcut keydowns are user activation, so they can open PiP.

## Alternatives Considered

- **`window.open` popups.** These allow any number of windows, but each popup is a separate page with its own kernel, so cross-tab sync of files, settings and session has to come first.
- **PiP with a route argument for popups later.** Rejected as speculative shape.
- **Same service on both platforms with `supported: false`.** No `has` checks, but a service that does nothing on mobile.
- **`WindowFlag.EXTRACTED` on DesktopWindowsService.** No new service, but the windows service would grow DOM-heavy PiP work (style copy, observers).
- **Local state in `window.svelte`.** This was the proof of concept's approach. The taskbar, Activity Monitor and shell can't see or trigger it.
- **Placeholder in the frame.** Clear, but it leaves a dead rectangle on the desktop.
- **Manifest opt-in or size hint.** It changes `define_app` for little gain, since any app works at its current bounds.
- **Overlays in the tab, or bring back on any overlay.** In the tab, menus open behind the mini window; bringing back yanks the app home on a right-click.
- **Callers pass `origin`.** Every app call site would change, and a forgotten one opens in the tab.
- **Ask to save, then pop.** Awaiting the prompt spends the user activation, so `requestWindow` fails.

## Consequences

- At most one app is out at a time. Popping another brings the first back.
- In-memory state that isn't stored (a game in progress, an unsaved timer) resets on pop out and on bring back.
- OS shortcuts typed inside the mini window don't fire: ShortcutsService listens on the tab's document. Left for later.
- Mobile has no service, no button and no commands.
