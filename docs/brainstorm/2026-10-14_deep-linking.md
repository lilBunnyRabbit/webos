# Deep Linking and Share

**Date:** 2026-10-14
**Participants:** owner, Claude

## Context

Block 7 of the ROADMAP: ADR-010 (Feb 2026) planned hash routes for apps, files, demo presets and saved workspaces, plus `?embed=true`, a share dialog with a QR code, and an OS-level router. Nothing reads the hash today. Boot is `kernel.init()` then mount, the only URL input is `?platform=`, and the site lives under `/webos/` on GitHub Pages. SessionService shows the Restore dialog without awaiting it, and its `status` stays `pending` until the answer.

The catch: 15 of the 17 apps with props only take `{ path }`, a path into the sender's OPFS. That file doesn't exist on anyone else's machine, so file links and saved workspaces only work as links to yourself. The only props a stranger's link can carry today are Settings' `section` and the example app's `count`.

## Topics

| Question | Decision | Rejected |
|----------|----------|----------|
| Scope | **App links only:** `#/app/{id}?{props}` | App + file links (dead for anyone else); full ADR with workspace, demo and embed |
| Link plus saved session | **Restore first, then the link.** The router waits until the session status leaves `pending` | Link skips restore (the next save would overwrite `session.json` with one window); link opens behind the dialog |
| Hash after handling | **Consume and clear** with `history.replaceState`, also on `hashchange`. Reload doesn't re-open | Sync the hash to the focused window (reload duplicates windows, history churn); keep the hash |
| Share action | **Copy link** that writes the URL to the clipboard. No QR (a dependency or a hand-written encoder) | Share dialog + QR; no share UI |
| Where Copy link lives | **Titlebar icon button**, next to Minimize | Titlebar right-click menu; taskbar menu; shortcut only |
| Query string to props | **JSON-parse each value, fall back to the raw string.** zod validates after. A numeric-looking string can't be expressed; accepted | Strings only with `z.coerce` per app; one `?props=` JSON blob |
| Which windows are shareable | **Any app whose props schema has no `path` key.** Derived, no manifest change | Manifest `shareable` flag; every app |
| Router home | **RouterService**, a kernel service with an inspector. Overrides the ADR's "OS-level, not a service" | Pure module called from `os.svelte`; a function in `main.ts` after mount |
| Link data | **Launch props only.** Settings shares the section it was opened with, not the one showing | Props merged with schema-known state keys; an app-context `set_link_props` hook |
| Service API | `link_for(id)` and `copy_link(id)`, which copies and toasts | `link_for` only, clipboard in the titlebar |
| Bad link | **Toast, nothing opens**, for an unknown app or props that fail the schema | Open with props dropped (the ADR's rule) |
| Mobile | **Links open, nothing to share from.** No titlebar, no Copy link in v1 | Link button on switcher cards with `navigator.share` |

## Key takeaways

- Routing is app launching from a URL. Files, workspaces, demos and embed wait until links can carry something that exists on the receiving end.
- The Restore dialog stays in charge of boot. The link is one more window after it.
- `apps.launch()` opens an app without its data when its props fail the schema. A link refuses instead, so the router checks the schema itself before launching.

## Action items

- [x] ADR-010 revision
- [x] RouterService: parse, consume, `link_for`, `copy_link`, inspector, unit tests
- [x] Titlebar link button for shareable windows
- [x] System reference page, changelog, ROADMAP

## Next session topics

- File links, workspace, demo presets and embed when an app has content worth linking to
- Share on mobile (`navigator.share` from the switcher)
