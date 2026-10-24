# Soft surfaces (neumorphism)
**Date:** 2026-10-23
**Participants:** owner, Claude

## Context
Owner: "brainstorm the app design a bit. maybe i would want to push it to more neumorphism".

Today (docs/design/foundations.md): depth from the seven-shade surface ladder, hairline rings (`ring-foreground/8`–`/10`, control edges `/30`–`/45` for 3:1), four cast-shadow tokens in `background-darkest` (`shadow-raised`, `-popover`, `-window`, `-window-focused`, app.css). Appearance settings already scale Corners (`--radius-scale`) and Shadows (`--shadow-strength`). Widgets have styles Card, Glass, Clear (2026-10-21_widget-styles).

Comparison page (Flat today, Soft, full neumorphism in Brand Dark and Brand Light): https://claude.ai/artifact/U6axPRshAdWWeyi82snk5V

## Topics discussed
### Full neumorphism vs Soft (decided: Soft)
- Full neumorphism: one surface colour, shape only from a lit/dark shadow pair. Strong in Brand Light; muddy in Brand Dark (little range above a dark slate); drops the ladder, so window, titlebar and desktop merge; control edges fail 3:1; everything looks pressable; needs ~8px air per object, against "calm and compact".
- Soft (proposed): keep the ladder, add a lit top edge on raised things, inner shadows on fields and tracks, press-in on buttons and the active dock tile, 1px darkest outline for 3:1. Selected and checked keep `primary`. Lists, Terminal and editors stay flat; floating layers keep cast shadows.
- No new colour: lit edge from `background-lightest`, shadow from `background-darkest`.

### Shape of a change (decided, ADR-068)
Owner: "soft might just work. i want to do the whole app change so i can see it. but first the core/style-guide/kit then apps".
- **Switch:** replace outright. No Appearance setting, no theme field. Rejected: a Flat/Soft setting (two looks forever), part of the theme (ADR-015 revision keeps non-colour look out of themes).
- **Default:** moot, everyone gets Soft.
- **Shell:** nothing. Rejected: `appearance get/set` (bigger than asked), `theme surface` (not a theme field).
- **Apps:** utilities (`shadow-control`, `shadow-recessed`, `shadow-pressed`, `shadow-lit`) plus a batched sweep, one commit per batch; kit components where a control fits one.
- Built tokens: `shadow-lit`, `shadow-control`, `shadow-pressed`, `shadow-recessed`, `shadow-track`, `--edge-lit`, `bg-field`. Light fields moved from raised paper to a recessed well, since the inner shadow now says "sunk in".
- Owner: "dont push this. i first need to see it". Work stays on branch `soft-surfaces` until they've looked.

### Judge pass across all 26 presets (decided fixes)
Owner: "the border colors are not working that great with all themes. i really want polished ui for this. they should do visual passes with different themes and really polish it".
Three judges (light, dark, extreme presets) measured every theme. Findings: the `foreground/30` field ring fails 3:1 in every preset; the lit edge is invisible in dark presets and drew a dark line on primary fills and on near-white derived presets; shadows in `background-darkest` vanish on dark palettes and glow on saturated ones (While True, Red & Black, Brand Light ochre); tiles in floating layers read sunk.
Two root causes sat in theming, not Soft:
- **Ladder (decided: monotonic).** `derive_surfaces()` reflected off black and white, so near-white presets got "lighter" shades darker than `background` and pure-black presets got seven blacks. Now steps shrink toward the end and the light side floors at L 0.12; saved themes with the old expressions re-derive on load. Rejected: tokens only (menus stay darker than windows in 6 light presets).
- **Scheme (decided: by text polarity).** `color-scheme` came from background L > 0.6, so Red & Black (dark text on mid red) was "dark". Now light when foreground is darker than background. Rejected: keep the threshold.
- Setting rows' curved divider ends fixed (rounded only while targeted).
Token polish runs as two parallel variations for the owner to compare: **A** derives every edge and shadow from the surface in its own hue; **B** takes light from the foreground and shape from one crisp outline, with flat filled buttons.

### Kit pass (decided: soft at rest)
Owner: "not even all style guide foundations and all are in this style? like the sidebars ... inputs, sliders, toggle, checbox". The 3:1 resting ring made fields and tracks read as outlined. Decided: soft at rest (hairline-strong + deep well, lit lip), 3:1 edge on hover, cottontail on focus. Rejected: keep 3:1 at rest (outlined look). Then raised the selected segment, active side-nav item, keycaps, switch and slider knobs (shared `--knob`), a custom checkbox, `shadow-card` for Section cards, 6px slider groove.

### Second taste pass (decided: all B)
Owner: "i like it but i dont love it": the field outline was "too thin random color", "just a no" for switches and sliders, select chevron jumped, start menu tiles too light, and see-through hover/selected fills were "mixing 2 different styles". Live options page (https://claude.ai/artifact/Eu8Wp7yZRXkL12mEYG3jLs); owner: "all b". Wells lose their resting outline; knobs become panel-colour and raised (slider with a primary dot); tiles in floating layers take the panel colour; state fills become lift / chip / sunk. Select chevron is a centred mask that turns in place.

### Hover outlines dropped (decided, 2026-10-24)
Owner: "no hover outlines only focus with cottontail as it was", and the segmented chip touching the hovered well "drops the illusion". Every `hover:ring-*` went (kit wells, segmented, switch, checkbox, app tiles and cards); focus keeps the `cottontail` ring. `Segmented` pads 3px with chips 2px shorter, so the raised chip always floats with a visible gap and the control keeps its height.

### Verdict (decided: rejected, parked)
Compared live, Flat (master) against Soft (branch). Owner: "idk i dont think its better it would need a lot of finesse. lets keep the branch and go back to the master branch and document the decisions made here". Master stays Flat. Branch `soft-surfaces` is kept as reference; ADR-068 is Rejected with the lessons in its last revision.

## Key takeaways
- Neumorphism's tactile part (lit edges, recessed fields, press-in) fits WebOS; its "one surface colour" part fights the ladder and the dark brand.
- Soft can be made consistent, but it needs finesse per control (wells, knobs, chips, state) that a token swap and sweeps don't give.
- The theming bugs the judges found (non-monotonic ladder, scheme by background lightness) are real on master and stand on their own.

## Action items
- [x] Owner reviews the comparison page; grill the open questions before any code.
- [x] Phase 1: tokens, kit, window, taskbar, app tiles, Style Guide, design docs (branch `soft-surfaces`, not pushed).
- [x] Judge pass, ladder and scheme fixes (cbbf9f7a).
- [x] Variations A and B built; owner: "i barely see the differences. which one do you think is better". Picked A: the only one with control edges at 3:1 against both the field and the card in 23 of 24 presets (B: 2.0–2.9 on dark cards), and edges in the surface's own hue fix the foreground-hue clash. Merged into `soft-surfaces`.
- [x] Held app tile pressed every tile (`in-active:` matches any `:active` ancestor, and the grid itself is active); now `group-active/tile:` on each tile's own button.
- [x] Owner looks at phase 1 in the dev server.
- [x] Phase 2: app sweep in five parallel batches (system and kit, media and dev tools, productivity 1 and 2, games), merged into `soft-surfaces`; core dialogs and theme cards after. Media stages, cameras, QR and print previews kept as they were.

## Next session topics
- ~~Port the ladder and scheme fixes to master on their own?~~ Owner: yes; on master in 3.61.1 (2026-10-24). Soft agent branches deleted, `soft-surfaces` kept
