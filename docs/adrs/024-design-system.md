# ADR-024: Design System
**Date:** 2026-10-11
**Status:** Implemented (2026-10-11)

> **Revision 2026-11-07: the desktop gets its own theme token** ([brainstorm](../brainstorm/2026-11-07_brand-light-desktop.md))
> - The owner found Brand Light "too yellowish, using too much of the dark background". Its ladder already matched the brand, but the desktop, the full-screen shells and the scrim all painted `background-darkest`, and the brand's light ladder drops 0.1748 lightness below the page to a saturated tan (`#cab380`). The brand page itself sits on the cream page shade.
> - **Decision (owner):** an 18th theme token, `desktop`, that every frame paints (`bg-desktop`: desktop, `body`, mobile and solo shells, intro, update overlay, Settings' taskbar preview, the theme card's miniature). It defaults to `var(--background-darkest)`, so every other preset and every saved theme looks the same; Brand Light sets `var(--background)`. It changes the theme shape: the type, saved themes, Settings › Edit colours (which lists it with the surfaces) and the theme card.
> - **Builder calls within that decision:** the scrim is the desktop at 60% (so no other theme's scrim changes); the wallpaper, intro and update overlay glow is two ladder shades above the desktop (`desktop_glow()`), so it stays `background-dark` on the default desktop. Saves holding Brand Light's old rounded lower shades snap to the exact ones, so they still match the preset.
> - Rejected: `light-dark()` on every frame (While True lost its orange desktop, Red & Black's desktop merged with its windows); retuning Brand Light's lower shades (no longer the brand's values, still tan).
> - Shadows are still cast in `background-darkest` (decision 3), so Brand Light's window shadows stay a soft ochre.

> **Revision 2026-10-11: after an independent review**
> - **Text contrast (owner):** secondary text is `foreground/80` (passes AA at 11px). The brand's muted `/65` is kept for 13px+ captions and icons. The roughly 22 ad-hoc alphas collapse to 100 / 80 / 65 / 38.
> - **Focus (owner):** cottontail stays the focus colour in every palette, a documented exception to the brand's dark-mode "badge ink only".
> - **Logo (owner):** keeps the theme's primary.
> - **Required answers (owner):** questions use `dismissible: false` (ADR-019 revision).
> - **Floating layers** (start menu, menus, toasts, dialogs) move up to `background-lighter`, so they read as on top even over a window. The owner found the start menu hard to see over a window.
> - **One 8px gap** between the screen edges, the dock, and snapped windows. The owner spotted a double gap above the dock.
> - **Fields** use `light-dark(lightest, darker)` with a 30% ring; light palettes no longer get mustard fields.
> - **"Three shades" counts per window or panel.** The desktop and dock are the frame.
> - Derived ladders reflect at black and white instead of clamping.
> - Fixed accessibility issues: SettingRow ids, Segmented as a real radio group, start menu focus.

## Context

Every app drew its own buttons, inputs and layout with ad-hoc Tailwind, so nothing matched. The window titlebar was a light `foreground` band, against the brand's "dark is the brand". The brand defines colours, fonts and hard rules, but not spacing, radius, elevation, motion, a type scale or components. The owner asked for a full design pass with proper documentation, using series-tracker (calm, compact, small type, quiet active states, a floating dock) and time-since (surface ladder, recessed inputs, 14px radius, filled brand button with dark ink) as references. Brainstorm: [2026-10-11 Design pass](../brainstorm/2026-10-11_design-pass.md).

## Decision

1. **UI kit on native elements.** `src/lib/core/components/ui/` holds the shared components (Button, IconButton, Input, Select, Switch, Checkbox, Segmented, Section, SettingRow, SideNav, Toolbar, StatusBar, Badge, EmptyState, Spinner, Kbd, Separator). Variants use the installed `tailwind-variants` through `tv` from `$lib/core/utils`, which shares `cn()`'s merge config. Platform features do the hard parts: customizable `<select>` (`appearance: base-select`), `role="switch"` checkboxes, radio groups, native dialog and popover. bits-ui stays unused.
2. **The brand's surface ladder as theme tokens.** Six new tokens (`background_lightest` … `background_darkest`). The owner: extend each scheme with the brand's colours instead of deriving them. Brand Dark and Brand Light list the brand's exact values. Five-colour presets and older saves fill the ladder with `derive_surfaces()`, because they have nothing else to go on. This reverses the 2026-10-10 "no background ladder" choice.
3. **Quiet dark window chrome.** Titlebars a step lighter than the window (`background-light`), a hairline ring, `rounded-xl`, soft shadows cast in `background-darkest`, a stronger frame for the focused window.
4. **Design docs in `docs/design/` plus a Style Guide system app.** The docs give foundations, components, patterns and shell. The app renders every token and component live in the current theme.

The full spec is in `docs/design/`. This ADR records the structural choices.

## Alternatives Considered

- **Documented class recipes only:** nothing to maintain, but copies drift (the state before this ADR).
- **bits-ui components:** complete and accessible, but they duplicate native popover, dialog and select, against "use the platform".
- **Derived ladder for every theme:** one formula, but the owner wants the brand's own shades per scheme.
- **Keep `background` + opacity only:** no token change, but translucent overlays look muddy on brand colours, and the references lean on real shades.
- **Brand-tinted focused window:** more identity, but it adds a brand colour to every frame.
- **Folding design into `docs/system/`:** one place, but "how it should look" and "how it works" have different readers.

## Consequences

### Positive
- One look across the shell and every app. New apps start from the kit and the patterns.
- Light and dark palettes both get real depth.
- The Style Guide makes regressions visible inside the OS.

### Negative
- The kit is a shared layer that every app depends on. Changing a component changes every app.
- `Theme` grows from 11 to 17 tokens, and the Settings customiser shows them all (grouped, behind a disclosure).
- `appearance: base-select` and anchor positioning are Chrome-first, which is accepted by the "latest web features" rule.

## Related
- ADR-015 (customization and theming), the 2026-10-10 brand and theming brainstorm, `docs/design/`
