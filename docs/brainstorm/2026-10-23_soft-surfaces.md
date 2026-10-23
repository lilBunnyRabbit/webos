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

## Key takeaways
- Neumorphism's tactile part (lit edges, recessed fields, press-in) fits WebOS; its "one surface colour" part fights the ladder and the dark brand.

## Action items
- [x] Owner reviews the comparison page; grill the open questions before any code.
- [x] Phase 1: tokens, kit, window, taskbar, app tiles, Style Guide, design docs (branch `soft-surfaces`, not pushed).
- [ ] Owner looks at phase 1 in the dev server.
- [ ] Phase 2: user apps sweep in batches.

## Next session topics
- Owner's verdict on phase 1; tuning `--edge-lit` and the recessed depth in Brand Light.
