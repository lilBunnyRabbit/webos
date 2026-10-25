# ADR-073: Colour Atlas
**Date:** 2026-10-25
**Status:** Accepted

## Context

The owner wants a game that shows off all of `@lilbunnyrabbit/chromatics`' colour models. Every model class has a static `channels` field with a reference `range` and a `hue` flag (`Hct.channels = { h: { range: [0, 360], hue: true }, c: { range: [0, 145] }, t: { range: [0, 100] } }`). That makes one generic slider UI possible for any model.

Discussion: [brainstorm](../brainstorm/2026-10-25_chromatics.md).

## Decision

- **App `colour-atlas`, "Colour Atlas", Games.** It imports the package through `color-tools/color.ts` (ADR-072), extending those wrappers where needed, and has no package.json of its own.
- **Round:** a gamut-mapped sRGB target and the current model's sliders, built from `Model.channels`, with tracks that show a live gradient of the colour along each channel. The player submits; the score is `max(0, 100 - 8·ΔE2000)`.
- **Run:** 5 rounds, with models drawn by tier: 2 Familiar, 2 Perceptual, 1 Exotic. Each model carries a tier, a family and a source in one table in the app. Quantized models (`terminal`, such as `Srgb8`) and any model whose conversion can throw for in-gamut colours are kept out of the run, or the target is redrawn.
- **Dex:** a round with ΔE under 5 collects that model. Each dex page shows the model's family, its source, its channels and ranges, and `path(model, Srgb)` as a route. The dex is stored in `app.colour-atlas.dex` as model id → best ΔE.
- **Daily:** a seeded run (`daily_seed(day, "colour-atlas")`), recorded through `PlayTracker`. Its `daily_rank` is score, highest first. Practice picks a tier, or a single model from the dex.
- **Shell:** nothing.
- **Mobile:** the sliders are kit `Slider`s with large touch tracks, and the dex is a scrolling grid.

## Alternatives Considered

- **"Which space?" gradient guessing:** many models look the same, so it can't cover all 70.
- **A section of Color Tools:** a game inside a utility, with no daily.
- **Pure random models:** exotic-heavy runs feel unfair.
- **A campaign in a fixed order:** no replay variety.

## Consequences

- The package card in the Portfolio links here ("See it in WebOS").
- `docs/apps/colour-atlas.md` covers the tiers, the scoring and the dex.
- It depends on Color Tools being merged.
