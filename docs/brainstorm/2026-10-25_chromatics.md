# Chromatics in WebOS
**Date:** 2026-10-25
**Participants:** owner, Claude

## Context
`@lilbunnyrabbit/chromatics` 0.1.0 is on npm (MIT, ESM, one dependency: `@lilbunnyrabbit/optional`). It has 70 colour model classes on a conversion graph with exact rational matrices, CSS parse and format, CSS Color 4 gamut mapping, WCAG 2 contrast, ΔE, CVD simulation (Machado 2009), filters, compositing, interpolation, harmonies and ramps. The DSL evaluator, the scheme pipeline, APCA, `ensureContrast`, the image quantizer and the exporters are still inside the studio app and unpublished. Source: the handoff from the chromatics agent.

What WebOS has today:
- Color Games uses culori as its own dependency (`color-games/color.ts`).
- Nine apps use a native `<input type="color">`: Paint, Hopsprite, Soundboard, Icon Pack, QR Studio, Image Tools, Warren, and Settings › Colours.
- The kit has no colour picker. The "colour swatch picker" kit item is still open (ROADMAP Wave 2 follow-ups).
- Theme maths are hand-rolled in `settings/themes.ts` and `random-theme.ts`.
- Earlier logs: [color games](2026-10-18_color-games.md) ("everything colour-related should eventually come from a chromatics package"), [app triage](2026-10-14_app-triage.md) (Color Tools blocked on npm).

## Topics discussed

### Portfolio (decided, changed the same day)
First decision: fold the package into the existing Chromatics featured card, like Task Manager: add an npm link, rewrite the points for the package, drop culori from the stack, and add "See it in WebOS" once WebOS uses it. Rejected then:
- a separate small tile, which undersells the substance behind the studio;
- two featured cards, which break the bento layout.

The card was stale either way: it still described the culori engine ("about 100 models, lazy views").

**Changed:** the owner, after seeing the folded card: "i mean its just a link to npm package. the npm package is a big deal". As one npm link on the studio's card the package read as a footnote, while it's the larger piece of work (70 models, exact rational matrices, cited formulas and test vectors, V8 and JavaScriptCore). So the package gets its own featured card, `chromatics-package` (name `chromatics`, kicker `@lilbunnyrabbit/chromatics`, badge npm), beside the studio's, with its own graphic: one colour travelling Oklch → Oklab → Xyz65 → Rec2020, each hop's value from the package. The studio card is slimmed back to the studio (language, editor, audit, exports) and says it's built on the package; the npm link lives only on the package card. The bento layout was re-planned for eight cards instead of being a reason against two. Its "See it in WebOS" link will point to Colour Atlas once that ships.

### Dependency (decided)
Approved. Each app that uses the package lists it in its own `package.json` (ADR-045), pinned to `^0.1.0`. It goes in the root only when core adopts it, after a separate grill.

### First work (decided)
1. Swap culori for the package in Color Games. CSS Color 4 gamut mapping gives different hexes than culori's `clampChroma`, so out-of-gamut answers shift.
2. Color Tools. The owner wants to talk through which apps to include before building: see below.

### DSL (decided)
Leave the DSL in the studio for now. The owner will publish it as its own package soon, and the chromatics roadmap tracks that. The DSL theme builder (ROADMAP "Build WebOS themes with Chromatics") waits on that package.

### Which colour work belongs in WebOS (decided)
All four candidates go on the roadmap, in this order:
1. Split Color Games into four apps (below), still on culori.
2. Color Tools, which owns the package wrappers (`color-tools/color.ts`); the four games then swap culori for them.
3. Kit colour picker: one OKLCH picker in `$lib/core/components/ui` that replaces the nine native `<input type="color">`. This is core, so the package moves to the root, after its own grill.
4. Theme audit in Settings › Theme: WCAG for every token pair, CVD previews of the 17 tokens, and optionally a whole-desktop CVD filter. Core, with its own grill.
5. Color Mixing as the Mix section of Color Tools.

Each core step gets its own grill when it's picked up.

### Missing math (decided)
Use only what's in the package. The owner: "just use whats in the package." No copying studio files (APCA, `ensureContrast`, the quantizer) and no local formulas. So:
- Contrast is WCAG 2 only;
- there's no "fix toward AA" button, since that needs `ensureContrast`;
- there's no palette-from-image;
- Mix uses the package's `Ryb` and `mix`, ranked by `deltaE2000`, and is labelled approximate. If Kubelka–Munk lands in the package, Mix moves to it.

### Color Tools shape (decided)
One app with SideNav sections, like Dev Tools and Image Tools:
- **Pick**: EyeDropper where it exists. Elsewhere (phone, Firefox, Safari) it samples from the camera viewfinder or from an opened image: tap a pixel, with a small loupe.
- **Convert**: one colour in all 70 models.
- **Contrast**: WCAG 2 ratio of a foreground and background, with AA/AAA badges.
- **Vision**: a palette or colour as protan, deutan or tritan.
- **Harmony**: complement, triadic, tetradic, analogous, ramps and steps.
- **Palette**: swatches, saved as a `.palette` file.

Mix comes after v1. One window shares the current colour across sections.

Rejected:
- split small apps, which would all need the same picker and current colour;
- folding Color Tools into Color Games, which mixes utilities with dailies.

### Palette format (decided)
A `.palette` file in `/home` with an association and Open with (the Hopsprite / Font Maker pattern): `{ "version": 1, "name": "Sea", "colors": [{ "name": "deep", "css": "oklch(0.4 0.1 220)" }] }`. Hopsprite, Paint and the kit picker can read it later.

Rejected:
- app storage only, which isn't shareable;
- GPL/ASE import now, which adds formats before they're needed.

### Shell (decided)
Nothing for now, for both Color Tools and the games. Revisit once Color Tools exists.

### Split Color Games (decided)
The owner: "i would put color games as their own apps but tools in one". This reverses ADR-050's "one app" choice.

| Id | Name |
|----|------|
| `color-recall` | Color Recall |
| `odd-one-out` | Odd One Out |
| `gradient-sort` | Gradient Sort |
| `hex-guess` | Hex Guess |

- **Dailies:** seeds stay on `daily_seed(day, "color-games/{mode}")`, so today's puzzles don't change (the Sudoku precedent). New results go under the new id. The old `color-games/*` rows stay as history, which Game Hub still counts.
- **Old ids:** a new optional `define_app` field, `replaces: [{ app, props? }]`, maps old links (`#/solo/color-games?mode=recall`), launches, and the installed and offline lists to the new app.
  - Rejected: a core table, which puts app knowledge in core.
  - Rejected: a hidden stub app, which leaves a ghost in the registry.
  - Rejected: rewriting `plays.json` keys, which means a migration for one app.
- **Shared code:** chromatics wrappers live in `color-tools/color.ts` and the games import them (the ADR-045 cross-app pattern, like Image Tools → PDF Tools). Generic game bits go to `$kit/games`; colour-game-only bits stay in one game's module that the others import.
- **Order:** split first, on culori (same behaviour), then Color Tools, then the games swap.

The ADR is [ADR-071](../adrs/071-split-color-games.md). Color Tools is [ADR-072](../adrs/072-color-tools.md).

### Colour Atlas (decided)
The owner: "maybe a fun game showcasing all the color models". Every package model has static `channels` with a `range` and a `hue` flag, so one generic slider UI covers all 70 models without model-specific code. The game is also the package card's "See it in WebOS" target.

- **Game:** dial plus a collection. Each round shows a target swatch and the sliders of one model. Match the target; the score is `max(0, 100 - 8·ΔE2000)`. A round with ΔE under 5 collects that model into a 70-slot dex. Each dex page shows the model's family, its source, its channels and ranges, and its route through the conversion graph.
- **Tiers:**
  - Familiar: RGB, HSL, HSV, CMYK and the like.
  - Perceptual: OKLCH, Lab, HCT and the like.
  - Exotic: XYB, ICtCp, ACEScc, CAM16 and the like.

  A run of 5 is 2 Familiar, 2 Perceptual and 1 Exotic. Slider tracks show live gradients, so any model is solvable by eye. Targets are gamut-mapped sRGB.
- **Daily and practice:** the daily is a seeded run, which Game Hub ranks by score, highest first. Practice can pick a tier, or a model from the dex.
- **Home:** its own game app (the fifth colour game, one game per app), importing `color-tools/color.ts`.
  - Rejected: a Color Tools section, which would put a game in a utility with no daily.
- **Persistence:** the daily goes through `PlayTracker` (`plays.json`). The dex lives in app storage, `app.colour-atlas.dex` (model id → best ΔE), which backup already covers.
- **Name:** Colour Atlas, id `colour-atlas`. The owner picked the British spelling over the US "Color" the other colour apps use.
- **Shell:** nothing.
- **Rejected:**
  - "Which space?": many models give near-identical strips, so it can't cover all of them.
  - All modes at once: too big, and against one game per app.
  - Pure random rounds: exotic-heavy runs feel unfair.
  - A fixed campaign: no replay variety.
- **Order:** after Color Tools merges. ADR: [ADR-073](../adrs/073-colour-atlas.md).

## Key takeaways
- The package is the only source of colour math in WebOS. Anything it lacks waits for the package.
- The DSL theme builder waits on the owner's DSL package.
- The package enters core only through the kit picker grill.

## Action items
- [x] Portfolio: rewrite the Chromatics card and drop culori from the stack.
- [x] Portfolio: the package's own featured card beside the studio's, with its conversion-route graphic (owner reversal, 2026-10-25).
- [x] Portfolio: "Play it in WebOS" on the package card, pointing to Colour Atlas.
- [x] Split Color Games (ADR-071).
- [x] Color Tools v1 (ADR-072), 2026-10-25. It can run in parallel with the split, since they share no files beyond the compat list.
- [ ] The games swap culori for `color-tools/color.ts`, after both of the above merge. Out-of-gamut hexes shift, since CSS Color 4 gamut mapping differs from `clampChroma`. Check the `hex`, `odd` and `sort` tests.

## Next session topics
- Kit colour picker: root dependency, API, which of the nine native inputs move first.
- Theme audit and desktop CVD filter: Settings shape, and a CSS/SVG filter from the package's Machado matrices versus per-token simulation.
- Color Tools Mix section.
- Shell commands for colour, once Color Tools exists.
- Hopsprite's hand-rolled `nearest_index` colour distance could move to the package's ΔE.
