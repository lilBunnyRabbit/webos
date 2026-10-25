# ADR-073: Colour Atlas
**Date:** 2026-10-25
**Status:** Implemented

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

## Revision 2026-10-26: implemented

What the build decided inside the ADR:

- **Slider ranges.** Each channel's reference range from `Model.channels`, except where it dwarfs the part sRGB uses (more than 20 times its span): there the slider covers sRGB's extent plus 5%. Only ACES2065-1 and ACEScg hit this; their reference range runs to 65504 (the half-float ceiling) while sRGB stays under 1, so a 0–65504 slider couldn't be played. The extent comes from converting a 9×9×9 sRGB grid once per model. The dex page still shows the reference ranges.
- **Exclusion, by rule.** `terminal` models (only `Srgb8`) never get a round; their dex slot shows the name and "Not played". Throwing conversions are handled by redrawing the target, not by excluding the model: a target is redrawn (up to 400 times, seeded) while the conversion throws or lands outside a non-hue slider's range. That keeps `Ryb` (~0.4% of sRGB throws) playable, and keeps targets reachable for models whose reference ranges don't hold all of sRGB (HPLuv `p`, SMPTE C, CAM16-LCD, Hunter Lab, LMS, U\*V\*W\*). 69 of 70 models are collectible.
- **Targets and starts.** A target is an OKLCH colour (l 0.35–0.9, c 0.03–0.2, any hue) gamut-mapped to sRGB hex. The sliders start on another such colour converted to the model and clamped into range.
- **Scoring.** ΔE2000 between the target and the guess as the screen shows it (gamut-mapped), so a guess past sRGB isn't scored on colour nobody saw. Round score rounded to 0.1; total out of 500.
- **Tiers.** Familiar: sRGB and the everyday RGB, hue and ink models (13 playable). Perceptual: OK*, CIE Lab/LCH/Luv/LCHuv, HSLuv/HPLuv, HCT, DIN99 (19). Exotic: everything else (37). Family and source come from the package README's section and source column.
- **Daily resume and challenge links**, as the colour games do: `app.colour-atlas.daily` keeps the day's attempt (submitted slider values and time); props `seed` (day or number) and `pool` (`mixed`, a tier or a model id) make the share line's link replay the same run. Practice from the dex is a run of five rounds on that one model.
- **Sliders** are kit `Slider`s with the live gradient as a strip under each one (as Color Tools does), since the kit Slider draws its own track.
- `color-tools/models.ts` gained `route(from, to)` over the package's `path`.

