# Colour Atlas
Id `colour-atlas` · Source: `src/lib/apps/user/colour-atlas/` · [ADR-073](../adrs/073-colour-atlas.md) · [brainstorm](../brainstorm/2026-10-25_chromatics.md)

## What it does

A run is five rounds. Each round shows a target swatch next to your colour and the sliders of one colour model; you dial the model's channels until the two match, then submit. The reveal shows both swatches, the target's and your values in that model, the ΔE2000 and the score. A round closer than ΔE 5 collects the model into the atlas, a 70-slot grid where each model gets a page: family, source, channels with their reference ranges, and the route its colours take to sRGB. There's a daily run (Game Hub row, ranked by score, highest first) and practice runs by tier or by one model, picked from the toolbar or a model's page.

## How it works

Pure logic is in `atlas.ts` (the model table) and `game.ts` (ranges, draws, scoring, dex, share line), Node-tested in `game.test.ts`. The window is `colour-atlas.app.svelte`; a run is `run.svelte`, the grid and pages are `dex.svelte`. All colour math goes through `color-tools/color.ts` and `color-tools/models.ts` (ADR-072); the app has no package.json of its own and imports nothing from the package directly.

### The model table

`ATLAS` in `atlas.ts`: one row per package model, id → name, tier, family and source. Family is the package README's section (Core, Wide-gamut RGB, ACES, Video, Perceptual, More hue models, Subtractive, Tristimulus and Lab-like, Appearance); source is that README's source column. A test keeps the table's ids equal to the package's `models`.

| Tier | Models | Playable |
|------|--------|----------|
| Familiar | sRGB, Display P3, Adobe RGB, ProPhoto, Rec. 2020, HSL, HSV, HWB, HSI, HSP, CMY, CMYK, RYB, sRGB bytes | 13 |
| Perceptual | OKLab, OKLCH, Okhsl, Okhsv, CIE Lab/LCH (D50 and D65), Luv and LCHuv (D65 and D50), HSLuv, HPLuv, HCT, DIN99, DIN99 LCh, DIN99o, DIN99o LCh | 19 |
| Exotic | XYZ, linear RGBs, Rec. 2100 PQ/HLG, SMPTE C, ACES ×4, video Y′CC models, Cubehelix, TSL, Jzazbz, JzCzhz, ICtCp ×2, CAM16 ×4, CIECAM02, xyY, u′v′Y, uvY, U\*V\*W\*, LMS, IPT, Hunter Lab, XYB | 37 |

### Sliders

Built for any model from its `channels` (`channels_of`): one kit `Slider` per channel in constructor order, step a thousandth of the range, with a strip under it showing the colours that channel gives with the others held (`channel_track`, 9 stops, 13 for a hue). The strip is the game's content, so it's the one place colour isn't a theme token.

The range is the channel's reference range, except where that range is a format ceiling rather than where colours live: when it's more than 20 times the span sRGB covers in that channel, the slider covers sRGB's extent plus 5% (`play_channels`). The extent is measured once per model by converting a 9×9×9 grid of sRGB bytes. Only ACES2065-1 and ACEScg are narrowed (0–65504 → about 0–1.05). Hue channels always keep 0–360.

### Exclusion and redraws

- **Byte models** (`terminal`, only `Srgb8`) never get a round: they round on every step. Their slot shows the name and "Not played"; the page works.
- **Throwing or unreachable targets are redrawn.** `draw_target` draws an OKLCH colour (l 0.35–0.9, c 0.03–0.2, any hue), gamut-maps it to sRGB hex, converts it to the round's model, and redraws while the conversion throws (`Ryb`'s Newton inverse fails on ~0.4% of sRGB) or a non-hue channel lands outside its slider. HPLuv's `p`, SMPTE C, CAM16-LCD, Hunter Lab, LMS and U\*V\*W\* have reference ranges that don't hold all of sRGB, so this keeps every target reachable. Up to 400 draws from the seeded generator; the test checks 25 targets per model reach their sliders and never hit the grey fallback.
- **Starts.** The sliders start on another drawn colour converted to the model and clamped into range (midpoint where it doesn't convert).

### Runs

`draw_run(seed, pool)` with mulberry32 (`create_rng`): `mixed` shuffles each tier and takes 2 Familiar, 2 Perceptual, 1 Exotic in the order F P F P E, all different; a tier takes five different models from it; a model id plays that model five times. Then a target and a start per round from the same generator. The daily's seed is `daily_seed(day, "colour-atlas")`; practice uses `random_seed()`.

### Scoring

ΔE2000 (`delta_e2000`, Lab D65) between the target hex and the guess as the screen shows it (`to_display_srgb`, gamut-mapped), so a guess past sRGB is scored on what was visible. Round score `max(0, 100 − 8·ΔE)`, to 0.1; a run is out of 500. Share line: `Colour Atlas #N  total/500`, a band per round (🟩 ≥ 90, 🟨 ≥ 70, 🟧 ≥ 40, 🟥 below) and a solo link that replays the run. Day 2026-10-25 is #1.

### Dex

`record_dex`: a round under ΔE 5 collects its model and keeps the best ΔE. The grid shows `?` and a number for uncollected models; every slot opens its page. The route is `route(model, Srgb)`, the package's conversion-graph path, with each step linking to its own page.

## Data

- `app.colour-atlas.dex` (app storage, ADR-003): `{ [model id]: best ΔE }`, zod-validated, rounded to 0.01. Backup covers it with the rest of `app.*`.
- `app.colour-atlas.daily`: `{ day, state: { guesses, ms } }`, each submitted round's slider values. A daily is one attempt: reopening resumes at the next round, or shows the result.
- Daily results go to `/var/lib/games/plays.json` through `track_play` (`DailyRank.SCORE_DESC`).
- **Props:** `daily` (Game Hub's contract), `seed` (a day or a number, from a share link; a day other than today plays as a challenge and isn't counted), `pool` (`mixed`, a tier or a model id).

## Limits

- The extent grid has 9 steps per axis, so a channel's sRGB extent can be slightly under the true one; only the two ACES ranges use it, with 5% padding.
- No hint which way to move; the strips are the hint.
- The app chunk is 26.8 KB, 10.3 KB gzipped (production build, 2026-10-26); the 70 models come in the `models` chunk it shares with Color Tools. The manifest adds about 0.6 KB gz to boot (manifest, meta, changelog line).

## Decisions

- [ADR-073](../adrs/073-colour-atlas.md) and its 2026-10-26 revision (ranges, redraws, scoring on the displayed colour).
- [Chromatics in WebOS brainstorm](../brainstorm/2026-10-25_chromatics.md), "Colour Atlas".
