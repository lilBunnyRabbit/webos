# Brand & Theming
**Date:** 2026-10-10
**Participants:** @lilbunnyrabbit, Claude

## Context

The owner wants WebOS to follow the lilBunnyRabbit brand (https://lilbunnyrabbit.github.io/brand/): the colour scheme, defined in OKLCH, with the logo placed in many places. The brand spec was read in full from `llms.txt`, along with the mark SVG and the fonts in the brand repo.

## Topics

### Theme model (architectural, owner decided)

The brand says "do not add colours" and "nothing rebinds between modes". The app already had a free colour editor and 20 presets, and ADR-015 planned accent customization.

Options raised:

- **Brand-fixed, with a mode toggle only.** The colour editor and presets would be deleted.
- **Brand as default with overrides on top.**
- **Remapping brand tokens.**

**Decision (owner):** keep multiple themes. Add the brand as two palettes, **Brand Dark** and **Brand Light**. Extend the theme with more tokens where needed, but no deep background steps.

Resulting design:

- `Theme` has 11 tokens: the 5 base colours, plus `tertiary`, `cottontail`, `success`, `warning`, `error` and `info`.
- Brand Dark is the default. Light and dark are palettes, not a mode switch, so there's no persistence question for now. Theme persistence stays blocked on ADR-002.
- Legacy 5-colour presets get the extra tokens from `derive_theme()`. It uses CSS relative colour syntax off `--primary`: states at primary lightness, chroma 0.14, and the brand's hues (140, 70, 30, 240). This mirrors how the brand derives its own states, so no colour is hand-picked.
- `background-dark` stays derived by mixing with black. There's no 7-step ladder.
- Tailwind's default palette is disabled, so off-brand colours can't compile.

### Logo

The mark is single-colour (`currentColor`). There are three components:

- the mark
- the lockup, with Hack 700 at 42% of the mark's height, and the mark alone below 32px
- the badge, a primary disc with the mark in `background`

Static assets (favicon, PWA icons, splash) are always Brand Dark, per the brand rule. They use hex because librsvg can't parse OKLCH.

Placements:

- favicon and PWA icons
- the boot splash
- the start button
- the start menu header
- Settings → About
- the Kernel app header

There's no desktop watermark, because the brand forbids fading the logo.

### Fonts

Inter and Hack are self-hosted from the brand repo's files, with their licences included.

## Found along the way

- The start-menu popover rendered on the browser's default white. That breaks the brand rule "nothing on white", so it now uses `bg-background`.
- `index.html` referenced a `/favicon.svg` that didn't exist. It exists now.
- The PWA `includeAssets` list named files that didn't exist. It's fixed.
- The off-palette red, blue, green and yellow utilities in Settings, the file explorer and the desktop are now state tokens.

## Key takeaways

- The brand is a constraint on palettes, not a replacement for user themes.
- Derivation beats hand-picking. A preset can never introduce a colour the brand formula wouldn't produce from its own base.

## Action items

- [x] Brand palettes + extended tokens, Tailwind palette disabled
- [x] Fonts, logo components, placements, icons, splash
- [x] ADR-015 revision, CONVENTIONS "Styling & brand", ROADMAP
- [ ] Theme persistence (with ADR-002)
- [ ] Window chrome and component styles against the brand (Design System roadmap)
- [ ] Revisit if the brand mark leaves WIP (v6) and gets a final version

## Next session topics

- Window chrome redesign within the brand rules (e.g. the titlebar currently uses a `foreground` fill)
