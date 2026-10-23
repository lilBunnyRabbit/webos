# ADR-068: Soft Surfaces
**Date:** 2026-10-23
**Status:** Implemented

## Context
The owner wanted the look pushed toward neumorphism. Depth today comes from the seven-shade surface ladder, hairline rings and four cast shadows in `background-darkest` (ADR-024, docs/design/foundations.md). A comparison page drew Flat (today), Soft and full neumorphism in Brand Dark and Brand Light ([brainstorm](../brainstorm/2026-10-23_soft-surfaces.md)). Full neumorphism goes muddy in Brand Dark, merges the ladder, loses 3:1 control edges and makes every card look pressable.

## Decision
- **Soft, as the one look.** No setting and no theme field: the tokens in `app.css` change for everyone. No shell command.
- **Tokens** (in `@theme`, so each is a `shadow-*` utility): `shadow-lit` (lit top edge), `shadow-control` (buttons), `shadow-pressed` (held, toggled on, active dock item), `shadow-recessed` (fields, segmented and switch tracks), `shadow-track` (slider grooves). `shadow-raised` and `shadow-popover` gain the lit edge. `--edge-lit` is `background-lightest` at 85% (light) / 45% (dark); shadows stay in `background-darkest` and scale with `--shadow-strength`. No new colour.
- **`bg-field`** names the well colour, `light-dark(var(--background), var(--background-darker))`. Light palettes' fields move from raised paper (`background-lightest`) to a recessed well.
- **Where:** kit controls, window titlebar, toolbar, Section cards, taskbar, app tiles in the desktop, start menu, phone home and drawer. Lists, tables, the terminal, editors and canvases stay flat. Selection keeps `primary`.
- **Apps:** apps on kit components get it for free. Hand-styled controls in user apps move to the utilities (or to kit components) in batches, one commit per batch.

## Alternatives Considered
- **Full neumorphism** (one surface colour, light and dark shadow pair): muddy in dark palettes, drops the ladder, fails 3:1 control edges, needs ~8px air per object.
- **Appearance setting (Flat / Soft):** live comparison, but two looks to maintain forever. The owner chose one look.
- **Part of the theme:** ADR-015's revision keeps non-colour look out of themes; saved themes and `theme random` would have to carry it.
- **Pilot as a widget style first:** lower risk, but the owner wants to see the whole system change.

## Consequences
- Everyone's look changes on update; no way back to Flat but git.
- A new control in an app reaches for `shadow-control` / `shadow-recessed` / `shadow-pressed` instead of a bare ring; the 3:1 ring stays on fields and switches.
- Shadows › None removes drops and inner shadows but keeps the lit edge.
- 80 user apps need a sweep for hand-rolled buttons and fields (`bg-[light-dark(var(--background-lightest),var(--background-darker))]` in 15 files, among others).

## Revision 2026-10-24
- Judges measured all presets; the ladder became monotonic and `color-scheme` follows text polarity (brainstorm 2026-10-23_soft-surfaces). Two token variations were built; the owner took A: every edge and shadow derived from the surface in its own hue (`--edge-control`, `--hairline`, `--shadow-ink`, `--edge-lit`, `--raised`).
- Controls are soft at rest: `hairline-strong` plus a deep well; the 3:1 `edge` shows on hover and focus. This replaces "the 3:1 ring stays on fields and switches" above (owner's call).
- Kit pass: selected segment, active side-nav item, keycaps, knobs and a custom checkbox are raised (`shadow-control`); Section cards take `shadow-card`; knobs use `--knob`.
