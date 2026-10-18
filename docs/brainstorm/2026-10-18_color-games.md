# Color Games

**Date:** 2026-10-18
**Participants:** owner, Claude

## Context

Owner wants colour games like [dialed.gg/color](https://dialed.gg/color). Research (page + JS bundle, plus similar games):

- **Dialed:** 5 colours shown one at a time (Easy 5 s, Hard 2 s), rebuilt from memory with HSB sliders. Score per round `10 / (1 + (ΔE00 / 25.25)^1.55)` (CIEDE2000) with hue bonus/penalty, /50 total. Seeded daily (mulberry32), challenge links, share.
- **Families:** recall (Dialed), odd one out (Kuku Kube, Specimen), gradient sort (I Love Hue, Blendoku, FM100 hue test), guess the hex (Hexcodle), mix (Colorfle), name the colour (Colordle).

In the repo: daily results are day → app id → one result (`kit/games/plays.ts`), ranked by the manifest's `daily_rank` (ADR-035). No colour maths library; OKLCH only as CSS strings. The owner's `chromatics` project (culori-backed colour studio) isn't a package yet.

## Decisions

1. **Shape: one app, per-mode dailies.** App `color-games` ("Color Games") with four modes, each with its own daily and Game Hub row.
2. **Modes:** Recall (Dialed), Odd one out (Kuku Kube), Gradient sort (I Love Hue / FM100), Hex guess (Hexcodle).
3. **Colour maths: culori as the app's own dependency** (ADR-045 scoped app package). CIEDE2000 for scoring.
4. **Chromatics later.** Everything colour-related should eventually come from a chromatics package; once it's published (scoped name, `chromatics` on npm is taken), the games swap over and colour shell commands come with it.
5. **Shell: nothing for now.**
6. **Daily storage: mode sub-keys.** plays.json stays version 1; daily keys like `color-games/recall`. Manifest `daily_rank` may be a per-mode record. Game Hub lists each mode as its own row. Old files stay valid.
7. **Recall sliders: HSB by default, OKLCH as a setting.**
8. **Share:** spoiler-free emoji line plus a solo challenge link with `mode` and `seed`. A friend's run of the link counts as their daily only when the seed is today's.
9. **Practice:** each mode has Daily (one attempt, counts in Game Hub, Recall fixed at Easy) and Practice (random seed, endless; Recall Easy 5 s / Hard 2 s).
10. **Hex guess hints:** per-digit higher/lower/correct, guess swatch beside the target, 0–F keypad on mobile.

## Key takeaways

- One app with several dailies needed a small extension of the play-tracker contract rather than a new format.
- Dialed's best moment is the side-by-side target vs guess per round; the result screen copies that.

## Action items

- [x] ADR-050: per-mode dailies (extends ADR-035).
- [x] Implement Color Games, Game Hub per-mode rows, docs, changelog (2026-10-18).

## Next session topics

- Publishing chromatics as a package; `color` shell commands on it.
- Mix mode (Colorfle) and name-the-colour if the four land well.
