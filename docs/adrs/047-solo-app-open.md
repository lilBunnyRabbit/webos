# ADR-047: Solo App Open

**Date:** 2026-10-18
**Status:** Implemented

## Context

An app link (`#/app/{id}?{props}`, ADR-010) boots the whole OS: the Restore dialog, the first-boot introduction, the desktop and the taskbar, then the app on top. Someone opening a shared form only wants to fill it. ADR-010 sketched an "embed mode" (`?embed=true`); it was deferred and is replaced by this.

Apps don't declare which services they use, and `kernel.service()` throws on a missing key. The window plumbing every app runs in already touches shell, shortcuts, extract, router, clipboard and dialogs. A smaller service set is not safe.

Discussion: [brainstorm](../brainstorm/2026-10-18_isolated-app-open.md).

## Decision

### URL and mode

`#/solo/{id}?{props}` opens one app, full page. Props parse and validate exactly like an app link. The kernel reads the mode once at boot, like the platform (ADR-016):

```ts
export const Mode = { FULL: "full", SOLO: "solo" } as const;
readonly mode: Mode = detect_mode(); // `#/solo/` prefix
```

The router doesn't clear a solo hash, so a reload reopens the same app. A hash change that crosses modes (a solo link pasted into a full tab, or the other way round) reloads the page.

### Every service boots, a few are swapped

Solo registers every key. Behaviour solo must not have is removed by swapping implementations under the same key, the way mobile swaps windows and AI:

| Key | Solo implementation | What it drops |
|-----|---------------------|---------------|
| `session` | `SoloSessionService` | Restore dialog, saving windows, reopen closed |
| `version` | `SoloVersionService` | Introduction, sample files, update notices and polling, the seen marker |
| `apps` | `SoloAppsService` | A second window: `launch()` returns the solo window and toasts "Open WebOS to use other apps"; no auto-install |

Files and settings are the person's own (same origin): their theme, their OPFS. An app saving in solo writes to their real `/home`.

### Shell

`load_shell` gets a third branch: `SoloShell`, for both platforms. A slim bar on top (app icon, name, window title) with a primary **Open WebOS** link that opens `#/app/{id}?{props}` in a new tab, so the solo tab keeps its state. Below it the window, full page, no chrome. Closing the window shows an empty state with Reopen and Open WebOS. Toasts and dialogs work as usual.

### Sharing

- Every app can open solo; no manifest flag.
- The titlebar Copy link button opens a menu: Copy link / Copy solo link.
- `link --solo` builds the solo link.
- Forms shares a form as a solo link; the answer link back stays a full OS link, since the owner saves answers into files.

## Alternatives Considered

1. **Reduced service set.** Faster boot, but any app touching a missing service throws, found only by use.
2. **Mode checks inside the full services.** Same effect with fewer classes, but `if solo` spreads through session, version and apps.
3. **Separate entry page** (`solo.html`). A second boot path and build entry to keep in step.
4. **`&solo=1` on the app link.** Mixes into the app's props; an app with its own `solo` prop clashes.
5. **Same-tab Open WebOS.** Loses the app's live state (a half-filled form); a state API (`snapshot()` in `define_app`) is new surface every app would opt into.
6. **Manifest opt-in.** Changes `define_app` for no gain: the app runs the same either way.

## Consequences

- Boot cost in solo equals the full OS; only rendering and three services differ.
- A solo app can't reach other apps; it says so and points to Open WebOS.
- The solo tab never writes the session or the version marker, so it can't disturb the person's own WebOS in another tab.
- Revises ADR-010: embed mode is replaced by solo.
