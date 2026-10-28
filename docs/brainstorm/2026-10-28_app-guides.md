# App guides
**Date:** 2026-10-28
**Participants:** owner, Claude

## Context
Owner: a friend had no idea how to play Plots. Wanted: "a button in toolbar that opens as overlay in the window content. and maybe always show it on first open of the app - if not opened with \"open with\" (for files for example)".

Today: every app has `description` and `pitch` (catalogue text, ADR-077); 53 of 107 have lazy `highlights` cards (ADR-038), shown only by the new-app announcement and the App Store. No app has how-to text. The title bar (`window-titlebar.svelte`) holds zoom, restart, Copy link, pop out and the window buttons; mobile windows have their own bar (`mobile-window.svelte`). Active time per app is kept in `/var/lib/apps/usage.json` (`active-time.ts`).

## Decisions
- **Content:** a new lazy manifest field `guide: () => import("./guide.md?raw")`, short markdown on how to use or play the app. The overlay shows the name, the pitch, the guide, then the highlights when the app has them. Apps without a guide show pitch, description and highlights. Rejected: existing info only (doesn't answer how to play Plots), a `guide` string in `meta.ts` (bloats the catalogue boot reads).
- **First open:** an app with no entry in `/var/lib/apps/usage.json` has never been opened (owner: "don't we track the opened count already"). Its first launch with no props shows the guide by itself, but only when the app has a guide. Any props skip it: Open with and files, deep links, daily props, shell props. No new file; apps used before this update count as opened.
- **Where the state lives:** windows get a transient `guide` flag (never saved in the session) and `windows.toggle_guide(id)` on WindowsService and its mobile variant, the same kind of state as minimized and maximized. Rejected: local state like zoom (F1 and the command couldn't reach it), UiService (one guide across all windows; it's for shell overlays).
- **Ways in:** a title-bar button on desktop and the same button in the mobile window bar; F1 toggles the focused window's guide (an OS shortcut running a command); `app guide <app>` launches the app and shows its guide.
- **Writing:** the mechanism first, with Plots' guide as the first one. A later pass writes guides for every app.

## Key takeaways
- One new manifest field, one transient window flag, no new persistence.

## Action items
- [x] ADR-085, one app-builder agent (implemented 2026-10-28).
- [x] Writing pass, a guide for every app (2026-10-28, see below).

## Next session topics
- Guide writing pass across all apps.

## Writing pass (2026-10-28)
- **Every app gets a guide** (owner). A guide that pops up on the first launch of an app that explains itself is a popup to dismiss, so apps can opt out: a manifest boolean `guide_on_launch: false` (owner picked it over a line in `guide.md` and an object form of `guide`). 43 apps opt out, mostly viewers, simple tools and settings-like apps; the writers picked them per app.
- **Modal, not full cover** (owner: "change the design of the info so it doesnt take the full window but its like a modal"). A card over a scrim like a window sheet: centred on desktop, a bottom sheet with a grabber on phones. Closed by Got it, the scrim, swipe down, the Guide button, Escape and Back.
- Writers read each app's code so the guides only state real keys, gestures and labels. Mismatches they found between apps' own text and code went to the owner as open calls (HTML Preview scripts, QR Reader barcodes).
