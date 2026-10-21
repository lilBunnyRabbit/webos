# AI mark on app icons

**Date:** 2026-10-21
**Participants:** owner, agent

## Context

Ask, Unsaid, Doodlehop and Alibi only work with Chrome's on-device AI (ADR-046, ADR-061). Nothing in the start menu, App Library, taskbar or phone drawer says so until the app opens and its `AiGate` explains the requirements. The icon is the one thing every surface already shows, at every size from the 16 px titlebar to the App Library's detail page, in roughly 25 render sites of `manifest.icon`.

## Decisions

### Mechanism: a kit icon wrapper

`ai_icon(Icon)` in `$kit/components/ai-icon` returns an icon component that draws the app's glyph plus a small sparkle in its top-right corner, inside the same box. The manifest says `icon: ai_icon(AppIcon)`. Every place that draws `manifest.icon` shows the mark with no change to the shell, and it scales with whatever size the site picks.

- It takes and forwards what the shell passes to icons: `class`, `weight` and any SVG attribute. Props go through a proxy rather than a copy, so the taskbar's `weight` switch stays reactive.
- The glyph is nested in a 24 × 24 SVG and masked: the mask cuts the glyph away 1.5 units around the sparkle (the sparkle's shape stroked 3 wide), a real cutout rather than a background-coloured patch, so it reads on any surface (taskbar, tiles, a selected row, the phone drawer).
- The sparkle is a four-point star in `var(--primary)`, 7 units across in the 16.5–23.5 by 0.5–7.5 corner. Primary reads at the 16 px titlebar and on light palettes, and sets the mark apart from the `currentColor` line work; the cutout keeps it from touching the glyph (brand: two colours never touch; icon rules: colour stays 1.5 units clear).
- Doodlehop's own `primary` dot sat in that corner and got bitten into a crescent, so it moved left (`cx` 17.5 → 11.5), still clear of the scribble.

### Which apps

Those that need on-device AI to work at all: **Ask, Unsaid, Doodlehop, Alibi**. Not Warren or Shopping List, where AI is one optional feature. All four already had `ai` in their search keywords, so searching "ai" in the start menu or App Library finds them.

### Shell

Nothing.

## Rejected

- **A manifest `ai` field plus a shared `AppIcon` overlay in the shell.** A public API change to `define_app`, and a sweep of every icon site in the shell to swap in the overlay.
- **Redrawing each icon by hand with a sparkle.** Four bespoke drawings that drift, and the next AI app has to remember the convention.

## Key takeaways

- A component-wrapping function keeps the decision local to the manifests that opt in.
- The top-right corner of an icon that may get the mark should stay free of its own colour element.

## Action items

- [x] `ai_icon` in `$kit/components/ai-icon`
- [x] Ask, Unsaid, Doodlehop, Alibi manifests use it; Doodlehop's dot moved out of the corner
- [x] Style Guide › App kit shows it at four sizes and in primary ink
- [x] `docs/design/components.md`, `docs/design/foundations.md` (app icons), `docs/system/app-api.md` (kit table)
- [x] Changelog line

## Next session topics

- None.
