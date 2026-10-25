# ADR-072: Color Tools
**Date:** 2026-10-25
**Status:** Implemented

## Context

`@lilbunnyrabbit/chromatics` (the owner's colour library) is on npm. It has 70 typed colour models, a conversion graph, CSS parse and format, gamut mapping, WCAG 2 contrast, ΔE, CVD simulation, interpolation, harmonies and ramps. Color Tools has waited on it since the 2026-10-14 triage. WebOS has no colour utility app, and the colour games use culori.

Discussion: [brainstorm](../brainstorm/2026-10-25_chromatics.md).

## Decision

- **One app, `color-tools` ("Color Tools"), Utilities.** SideNav sections, sharing one current colour across the window:
  - **Pick:** the EyeDropper API where it exists. Elsewhere, sample from the camera viewfinder or from an opened image: tap a pixel, with a loupe. Sliders and typed CSS in any model.
  - **Convert:** the current colour in every package model (`models` from `/all`), copyable.
  - **Contrast:** the WCAG 2 ratio of a foreground and background, with AA, AAA and large-text badges.
  - **Vision:** a colour or palette as protan, deutan and tritan (`simulateCvd`, with a severity control).
  - **Harmony:** complement, triadic, tetradic, square, split complementary, analogous, ramps and steps between two colours.
  - **Palette:** named swatches, saved as a `.palette` file.

  A **Mix** section, paint mixing on the package's `Ryb` ranked by `deltaE2000` and labelled approximate, comes after v1.
- **Only the package's math.** No copied studio code (APCA, `ensureContrast`, the quantizer) and no local colour formulas. A missing feature waits for the package.
- **Dependency.** `@lilbunnyrabbit/chromatics` `^0.1.0` goes in `color-tools/package.json` (ADR-045). `color-tools/color.ts` holds the snake_case wrappers other apps import: the colour games (ADR-071) and, later, others. The package moves to the root only through the kit colour picker's grill.
- **`.palette` format**, a file in `/home` with an association and Open with:

  ```json
  { "version": 1, "name": "Sea", "colors": [{ "name": "deep", "css": "oklch(0.4 0.1 220)" }] }
  ```

  Colours are CSS strings the package parses.
- **Brand.** The UI chrome uses theme tokens only. Swatches show content colours, as Color Games does.
- **Mobile.** Sections stack, and Pick uses the camera or image path. Touch sliders follow the kit `Slider`.
- **Shell:** nothing for now; revisit once the app exists.

## Alternatives Considered

- **Split small apps (Contrast Checker, Converter, Palette):** each would need the same picker and current colour, and they add launcher noise.
- **Fold into Color Games:** mixes utilities with daily games.
- **Embed the Chromatics studio in an iframe:** one-way, needs the network, and doesn't follow the WebOS theme.
- **Copy the studio's APCA, `ensureContrast` and quantizer:** forks tested code, and the owner chose to use only the package.

## Consequences

- WebOS's first use of the package. The portfolio's Chromatics card gets "See it in WebOS" pointing at Color Tools.
- `docs/apps/color-tools.md` covers the `.palette` format and the pick fallback.
- The EyeDropper entry in `compat/features.ts` gains `color-tools`.

## Revision 2026-10-25: built

Implemented as decided ([internals](../apps/color-tools.md)). Choices the build made inside the decision:

- **Pick offers the picture and the camera everywhere,** not only where EyeDropper is missing. On a desktop with EyeDropper, "Pick from screen" comes first; a photo or a webcam is still useful there.
- **The current colour is a string in the model it was last set in** (`hsv(…)`, `#…`, `oklch(…)`), kept in window storage with the open section and the other section settings. Two windows keep their own colour; a restored window gets it back. A slider edit in HSV stays exact in HSV instead of drifting through OKLCH.
- **Palettes live in Documents** and open through `json_file`, saved as you go, like Brackets. The list, New palette (seeded with the current colour), Open… and From device… follow that app. A colour that `parse()` can't read makes the whole file invalid (zod `refine`); the file is shown as unreadable, not repaired.
- **Sliders are the kit `Slider`** with a thin gradient strip under each (the channel's colours with the others held), since the kit slider draws its own `primary` track. Color Games' gradient-track `channel-slider` stays in that app; moving a colour slider into the kit is the kit picker's grill.
- **Contrast composites a translucent text colour over the background** (`Srgb.over`) before `contrast()`; both sides are gamut-mapped first, since WCAG is about what the screen shows.
- **Harmony rotates in OKLCH, Okhsl or HSL,** picked per window. "Add to palette" appears on each scheme while a palette is open.
- No new web API entry beyond EyeDropper: `getUserMedia` and `OffscreenCanvas` are Baseline widely available.

