# Live wallpapers

**Date:** 2026-10-20
**Participants:** owner, Claude

## Context
LaxDOTexe's idea: the Grid wallpaper's dots become little turrets firing lasers at the mouse, with a small explosion on a hit. Windows act as walls, or a "follow" mode shoots everywhere, and a pace setting runs from chill to frantic. Owner: "sounds like he wants interactive and animated wallpapers". So the framework first, then Pew Pew as the first live wallpaper.

Today a `Wallpaper` is `preset` (grid, glow, tint, plain) or `image` (`settings/type.ts`), stored in `/etc/settings.json` (zod in `persistence.ts`) and drawn by `wallpaper.svelte` on the desktop, the mobile shell and the Settings previews. The grid dots are CSS in `desktop.svelte`. There's no `wallpaper` shell command.

## Topics discussed

### Source: OS built-ins only, for now (decided)
A registry in `core/components/desktop/live/`. No manifest field yet; it can be promoted to `define_app` later.
Rejected for now: apps contributing wallpapers like widgets (a public API change).

### Contract: Svelte component plus context (decided)
A live wallpaper is a lazy Svelte component that gets a `LiveContext`: the pointer, window rects (walls), icon cells (the grid dots), `paused`, `preview` and its `options`. It draws however it likes (canvas, DOM, CSS, video).
Rejected: a canvas draw callback (canvas only).

### Overlay slot (decided)
An entry may also export an `overlay` component, mounted in one full-screen layer above windows and below the taskbar and dialogs, with `pointer-events: none`. Only the active live wallpaper uses it. Pew Pew's follow mode draws there.

### Pausing (decided)
`paused` is true when the tab is hidden or a maximized or fullscreen window covers the desktop. Motion-off and idle pauses were not picked.

### Options and previews (decided)
`settings.json` keeps the options of each live wallpaper used (`live_options: { [id]: {...} }`), validated by the entry's zod schema, so switching back keeps them. Settings thumbnails render with `preview: true` and `paused: true`, a still frame. The selected wallpaper shows its options form.

### Mobile: desktop only (decided)
Live wallpapers are hidden on mobile. A mobile setup carrying a live wallpaper falls back to the grid.

### Credit (decided)
A registry entry has `name` and optional `authors: AppAuthor[]`, shown as a byline in Settings (reusing app-byline).

### Shell: nothing (decided)

### Pew Pew, the first live wallpaper (decided)
- id `turrets`, name "Pew Pew", credited to LaxDOTexe and lilBunnyRabbit.
- Every grid dot is a turret that turns toward the cursor.
- Modes: Shield (default) draws bolts behind windows; a bolt reaching a window edge stops with a spark, so the mouse over a window is safe. Follow draws bolts in the overlay, reaching the mouse anywhere.
- Pace: Chill (one turret every ~1.5 s, slow bolts), Normal (a few turrets every ~0.5 s), Frantic (many turrets, rapid, fast).
- Sound: a synthesized WebAudio pew per shot and a soft pop on a hit, off by default, with a toggle and volume; pitch follows pace.
- Hit: a small puff of a few particles (~300 ms) in a theme colour at the cursor. Nothing else.

## Key takeaways
- The framework is small: a new `Wallpaper` kind, a lazy registry, a context and an overlay slot. Each wallpaper is a module.

## Action items
- [x] ADR-057.
- [x] Build the framework and Pew Pew (2026-10-21; details in the ADR's revision note).
