# Pew Pew: cosmetic laser damage
**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
LaxDOTexe, from his Proposals file: "The lazers cause TINY cosmetic damage to any widget/window that the mouse is hiding behind. Does not change functionality of window. Can potentially burrow up to where the mouse is. Button to reset or turn it off. Is visual, so like a different layer." First cut: "general tiny chunk damage"; later: "fixing it is to press a button on widget window and watch little rabbit workers construct it all back within a second or two." His sketch shows bites out of a window's bottom edge where the lasers hit, beneath the cursor.

What exists today (ADR-057):
- Bolts fly on the background layer. Shield hits are emitted in page coordinates through `live/turrets/impacts.ts`, and the overlay canvas (above windows, `pointer-events: none`) draws sparks there.
- `LiveContext.windows` / `.widgets` are `DOMRect[]` without ids (`live/context.svelte.ts`).
- Live wallpapers are desktop only.

## Decisions
- **Rendering: painted on the overlay layer (decided).**
  - The overlay paints jagged bites in the desktop background colour (theme token) over the edge that was hit, with a scorched rim.
  - Repeated hits near a spot dig deeper towards the cursor, up to a cap.
  - Window DOM stays untouched.
  - Rejected: CSS mask holes on the window or widget element (couples a wallpaper to the window manager's DOM, and cuts shadows and content).
- **Anchoring by id (decided).**
  - `LiveContext.windows` and `.widgets` become `{ id, rect }[]`.
  - Damage is stored per id, relative to the hit edge, so it moves and clips with its window or widget, and is dropped when the id disappears.
  - Revises the ADR-057 `LiveContext` shape.
  - Rejected: screen-fixed bites (they'd float in the air when the window moves).
- **Controls (decided).**
  - A new Pew Pew option, Damage, off by default.
  - "Repair everything" in the wallpaper settings.
  - Memory only, so a reload repairs everything.
  - Rejected: per-window Repair in the window menu (for now).
- **Shell:** nothing.

## Action items
- [x] ADR-057 revision note (LiveContext ids, damage).
- [x] Build agent: context ids, impacts carrying the shield id, damage model plus overlay drawing, option, Repair button. Docs: docs/system live wallpaper page. ROADMAP "idea from LaxDOTexe".

## Next session topics
- Rabbit workers rebuilding the damage, per window.
- Real see-through holes, if painted bites look wrong on Glass widgets.
