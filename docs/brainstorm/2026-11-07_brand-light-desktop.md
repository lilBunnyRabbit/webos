# Brand Light desktop
**Date:** 2026-11-07
**Participants:** owner, Claude

## Context
Owner: "The brand light theme is too yellowish its using too much of the dark background. Look at lilbunnyrabbit.github.io/brand again".

The brand page's light palette, token by token, against `BRAND_LIGHT` in `services/settings/themes.ts`: every value already matched. Three lower shades were rounded (`background_dark` `0.89 0.0562` vs the brand's `0.8907 0.0566`, `background_darker` `0.832 0.077` vs `0.8325 0.0777`, `background_darkest` `0.774 0.0725` vs `0.7742 0.0723`); fixed to the brand's values, but too small to see.

## Root cause
The tokens were right, but WebOS used the wrong one for the biggest area. The desktop, `body`, the mobile and solo shells, the intro, the update overlay and the 60% scrim behind menus and dialogs all painted `background-darkest` in every theme (ADR-024: "darkest: desktop"). In Brand Dark that's a near-black. The brand's light ladder is asymmetric, though: 0.051 up, 0.1748 down from the page, "until the text still reads 4.55". So its darkest shade is `#cab380`, a saturated ochre that covered the whole screen. The brand page itself sits on the cream page shade (`#f6eddb`) and keeps the dark shades for small things.

## Topics discussed

### Where the desktop colour comes from (decided)
1. **`light-dark()` on every frame** (`light-dark(var(--background), var(--background-darkest))`, the fields' pattern). Fixes Brand Light, but it follows text polarity, so every light-polarity preset changed: While True lost its orange desktop (its spec: "the orange is the desktop", in `background_darkest`), and Red & Black's desktop turned the same red as its windows.
2. **Retune Brand Light's lower shades** to a shallow 0.034 ladder. Token-only with no side effects, but no longer the brand's values, and the desktop stays tan, only lighter.
3. **A `desktop` theme token.** Defaults to the darkest shade, so every other preset and every saved theme looks the same; Brand Light sets its page shade. Changes the theme shape: the type, saved themes, Settings › Edit colours, the theme card.

**Decision (owner):** option 3. "Themes get a 'desktop' colour that defaults to the darkest shade. Brand Light sets it to its cream page colour; While True keeps its orange desktop and Brand Dark is unchanged."

### How it was built
- `desktop` is the 18th `ThemeToken`, a CSS colour string like the derived tokens: `DEFAULT_DESKTOP` = `var(--background-darkest)` for Brand Dark, While True, `derive_theme()` and every preset; Brand Light `var(--background)`. Written as `--desktop`, the Tailwind colour `desktop`.
- Old saves: `merge_theme()` already fills missing tokens from the brand palette with the same `background`, else Brand Dark, so a saved Brand Light gets the cream desktop and everything else the default. `.webos-theme` files without it import with the default.
- Everything that painted the frame uses `bg-desktop`. The scrim is the desktop at 60% (unchanged on every theme but Brand Light, where it's a cream veil). The wallpaper glow is `desktop_glow()`: the ladder shade two above the desktop, so it's still `background-dark` over the default, and `background-lighter` over Brand Light instead of a tan smudge.
- Settings › Edit colours lists Desktop under Surfaces; the theme card's miniature paints it; the Style Guide shows it.
- Checked: While True, Red & Black, Brand Dark (desktop, start menu with scrim, App Store, phone home) and Light Pastel Blue are pixel-identical to before apart from the clock.

### Shell (decided)
No new commands. `theme set`, `theme get`, `theme save` and `.webos-theme` files carry the whole theme, `desktop` included.

## Key takeaways
- Matching a brand's tokens isn't enough; the role each token plays has to match too. The brand's light dark side is a contrast reach, not a background.
- A role the themes disagree on (While True wants an orange desktop, Brand Light a cream one) needs its own token; a polarity switch can't tell them apart.

## Action items
- [x] Exact brand values for Brand Light's three lower shades
- [x] `desktop` token, frame, scrim and glow on it, Edit colours, theme card, Style Guide
- [x] ADR-024 revision, foundations, theming and settings reference
- [ ] Shadows are still cast in `background-darkest`, a soft ochre on Brand Light (flagged by the ADR-068 judges too); open

## Next session topics
- Whether shadows should follow `desktop` or `foreground` on light palettes.
