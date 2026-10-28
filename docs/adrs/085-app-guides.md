# ADR-085: App Guides
**Date:** 2026-10-28
**Status:** Implemented

## Context
Users open an app and don't know what it is or how to play it ([brainstorm](../brainstorm/2026-10-28_app-guides.md)). Description, pitch and highlights exist but only show in the App Store and announcements.

## Decision
- Manifest: optional lazy `guide: () => Promise<{ default: string }>` (a markdown file imported `?raw`), rendered with the existing markdown renderer. Never loaded at boot.
- Overlay inside the window content: name, pitch, guide (when present), highlights (when present); description as the fallback text. Dismissed by its close button or Escape.
- WindowsService (and MobileWindowsService): a transient per-window `guide` flag, not saved in the session, and `toggle_guide(id)`.
- Ways in: a title-bar button (desktop), the same button in the mobile window bar, F1 for the focused window (a shell command bound in `shortcuts/defaults.ts`), `app guide <app>` (launch, then show).
- First open: when an app has a guide, no entry in `/var/lib/apps/usage.json`, and was launched with no props, its window opens with the guide shown.

## Alternatives Considered
- Existing info only; guide text in `meta.ts`; guide state local to the window component; guide state in UiService; a separate seen-list file.

## Revision 2026-10-28 (implementation)
- **The flag** is `WindowFlag.GUIDE` in the window's existing `flags` set, so it's transient for free: the session keeps only `minimized` and `maximized`. `toggle_guide` lives in `BaseWindowsService`, shared by both implementations; showing it focuses the window. The inspectors list it with the other flags.
- **Mobile has no window bar** (`mobile-window.svelte` is chrome-less), so the button sits at the right end of the nav bar while an app is on screen. Back closes the guide first. Solo tabs got the same button in their header, and popped-out windows render the overlay too.
- **The renderer.** Core couldn't use `marked` (an app's own package, ADR-045), so the markdown-lite parser and `MarkdownView` Kanban and Forms already shared moved from Kanban into core (`utils/markdown`, `components/markdown`). Guides use headings, `-` lists, paragraphs and inline marks; no ordered lists or tables.
- **First open** also waits for `usage.json` to be read, and counts an empty props object as no props. A link with no props (`#/app/plots`) is a launch with no props, so it shows the guide on a first open.
- **Commands:** `win guide [ids]` (F1, focused window by default) and `app guide <app>`. F1 is a bare key, so it doesn't fire inside a text field, like every other F-key shortcut.

## Consequences
- `define_app` gains a field (app API, stable like the rest).
- A writing pass is needed for guides beyond Plots.
