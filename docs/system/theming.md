# Theming

Source: `src/app.css`, `src/lib/core/api/services/settings/themes.ts`, `settings/service.svelte.ts`, `src/lib/core/utils/utils.ts` (`cn`, `tv`) · ADRs: [ADR-015](../adrs/015-customization-theming.md) (see its 2026-10-10 revision), [ADR-024](../adrs/024-design-system.md) (surface ladder, UI kit) · Design: [docs/design](../design/README.md) (how things should look) · Brand: [lilBunnyRabbit brand](https://lilbunnyrabbit.github.io/brand/), rules summarized in [CONVENTIONS → Styling & brand](../CONVENTIONS.md#styling--brand)

This page is how theming works. Which token to use where (roles, ladder use, type scale, spacing, elevation) is in [docs/design/foundations.md](../design/foundations.md).

## The pipeline

```
SettingsService.theme  ──($effect)──►  <html style="--background-dark: …; --primary: …; color-scheme: dark">
                                              │
src/app.css  @theme inline { --color-background-dark: var(--background-dark); … }
                                              │
Tailwind utilities  bg-background-dark · text-foreground/65 · border-error …
```

1. `SettingsService.theme` is a `Record<ThemeToken, string>` holding 17 tokens. Keys are `snake_case` (`background_dark`).
2. An effect started in `SettingsService.init()` writes every token to `document.documentElement.style` as a **kebab-case** variable: `--${key.replaceAll("_", "-")}`, so `background_dark` becomes `--background-dark`. The same effect sets `color-scheme` (below). Nothing in CSS defines a default, so before the service inits, `var(--primary)` and the rest are unset.
3. `app.css` maps each variable into a Tailwind colour under `@theme inline`. `inline` makes the utility reference `var(--primary)` directly, so a runtime change applies immediately with no rebuild.

### `color-scheme`

After writing the variables, the token effect measures the applied `foreground` and `background`: a probe `<span>` with `color: oklch(from var(--…) l c h)`, read back through `getComputedStyle` (`lightness()` in `service.svelte.ts`). Any syntax works (hex, `oklch(from …)`, `color-mix`). When the text is darker than the background `<html>` gets `color-scheme: light`, otherwise `dark` (ADR-068: by polarity, so dark text on a mid-tone red is a light palette; it used to be background lightness above 0.6). The probe runs only when either changed or references another token (`var(`). Native scrollbars, date inputs and pickers follow the palette, not the OS preference, and so does CSS `light-dark()`: the kit's field surface `bg-field` is `light-dark(var(--background), var(--background-darker))`.

## Tokens

### Theme tokens (written to `<html>`)

| Theme key | CSS var | Tailwind colour | Brand Dark / Light | Derived presets |
|-----------|---------|-----------------|--------------------|-----------------|
| `background_lightest` | `--background-lightest` | `background-lightest` | explicit | `derive_surfaces()`, +3 steps |
| `background_lighter` | `--background-lighter` | `background-lighter` | explicit | +2 steps |
| `background_light` | `--background-light` | `background-light` | explicit | +1 step |
| `background` | `--background` | `background` | explicit | base colour |
| `background_dark` | `--background-dark` | `background-dark` | explicit | −1 step |
| `background_darker` | `--background-darker` | `background-darker` | explicit | −2 steps |
| `background_darkest` | `--background-darkest` | `background-darkest` | explicit | −3 steps |
| `foreground` | `--foreground` | `foreground` | explicit | base colour |
| `primary` | `--primary` | `primary` | explicit | base colour |
| `secondary` | `--secondary` | `secondary` | explicit | base colour |
| `tertiary` | `--tertiary` | `tertiary` | explicit | `color-mix` of primary and secondary |
| `accent` | `--accent` | `accent` | explicit | base colour |
| `cottontail` | `--cottontail` | `cottontail` | explicit | from primary. Also the global `:focus-visible` outline colour |
| `success` `warning` `error` `info` | same names | same names | explicit | from primary, fixed hues |

Types (`settings/type.ts`): `ThemeBaseToken` (the five base colours), `ThemeSurfaceToken` (the six ladder shades), `ThemeToken` (all 17), `ThemeBase`, `Theme`.

Plus one colour that isn't a theme token: `mark-ears`, fixed `oklch(0.949 0.0939 122.47)` in `app.css`, the same in every theme (logo only).

What each token is for: [docs/design/foundations.md](../design/foundations.md#colour-roles).

### The surface ladder

Seven shades around `background`, darkest at the bottom of the stack. The brand steps lightness by 0.034 per shade.

- **Brand Dark and Brand Light** list the brand's exact values (chroma scales with lightness; Brand Light's top shade is `oklch(1 0 0)` and its dark side steps further than 0.034).
- **Five-colour presets** get `derive_surfaces()`, spread by `derive_theme()`:

  ```ts
  // darker (step < 0)
  `oklch(from var(--background) calc(l - min(${-step * 0.034}, l * ${-step * 0.3})) c h)`
  // lighter (step > 0)
  `oklch(from var(--background) calc(max(l, 0.12) + min(${step * 0.034}, (1 - max(l, 0.12)) * ${step * 0.3})) c h)`
  ```

  The stored value is the expression, so editing `background` in Settings moves the whole ladder. "Dark" is always lower lightness and "light" always higher (ADR-068). In the middle each step is 0.034; near black or white a step shrinks toward the end instead of passing it, so the ladder never turns back. The light side starts from at least 0.12, so on pure black the chrome, cards and menus still separate from the body (the dark side stays black: there's nothing darker). Before ADR-068 a step past 0 or 1 reflected back (`abs()`), which made "lighter" shades darker than `background` on near-white presets; `merge_theme()` in `persistence.ts` swaps those old expressions (`legacy_surface()`) for the new ones when a saved theme loads.

### Other `@theme` entries

| Kind | Tokens | Notes |
|------|--------|-------|
| Fonts | `--font-sans` Inter, `--font-mono` Hack | See Fonts |
| Type | `text-2xs` (11px / 16px), `text-ui` (13px / 20px) | Added to Tailwind's scale. `text-ui` is the default for controls and dense UI |
| Tracking | `tracking-heading` (`-0.011em`) | Applied to `h1`–`h3` by the base layer |
| Radius | `rounded` 4 · `xs` 4 · `sm` 6 · `md` 8 · `lg` 10 · `xl` 14 · `2xl` 18 · `3xl` 24 (px) | Each is `calc(<px> * var(--radius-scale, 1))`; SettingsService writes `--radius-scale` (0.4 / 1 / 1.5) from `appearance.radius` ([settings](services/settings.md#behaviour--invariants)). `rounded-full` isn't scaled |
| Shadows | `shadow-raised`, `shadow-popover`, `shadow-window`, `shadow-window-focused` | Cast in `color-mix(… var(--shadow-ink) …)`. `--shadow-ink` (base layer, on `html`) is the body's hue at lightness ×0.3 and muted chroma, 45% alpha in light palettes, so shadows never glow in a saturated darkest shade. The percentage is multiplied by `--shadow-strength` (0 / 0.5 / 1 / 1.4 from `appearance.shadow`). `popover` includes a 1px `--hairline-strong` ring, which isn't scaled. Soft surfaces (ADR-068): `shadow-lit`, `shadow-control`, `shadow-pressed`, `shadow-recessed`, `shadow-track`; `raised` and `popover` include the lit edge `inset 0 1px 0 var(--edge-lit)`, a see-through highlight in the body's hue that isn't scaled. Primary and danger buttons set `--edge-lit` from their own fill |
| Field | `bg-field` | `light-dark(color-mix(in oklch, var(--background), var(--background-dark)), var(--background-darker))`: fields, segmented and switch tracks, the palette's command preview |
| Edges | `ring-edge`, `ring-edge-hover`, `*-hairline`, `*-hairline-strong`, `bg-raised`, `bg-raised-hover` | `--edge-control(-hover)`, `--hairline(-strong)`, `--raised(-hover)` on `html`, all relative OKLCH from the surface shades through `light-dark()`. The control edge is solved for ~3.1:1 with `pow()` (lightness cubed ≈ luminance) against `background-lighter` (dark) or `background-dark` (light). Formulas and rationale: [foundations](../design/foundations.md#soft-surfaces) |
| Easing | `ease-out` `cubic-bezier(0.22, 1, 0.36, 1)`, `ease-in-out` `cubic-bezier(0.65, 0, 0.35, 1)` | Override Tailwind's defaults |
| Animation | `animate-pop-in`, `animate-sheet-in` | `pop-in`: 160ms fade plus `scale: 0.97 → 1`. Menus, dialogs, snap preview. `sheet-in`: 200ms rise from `translate: 0 100%`, for anchored dialogs shown as bottom sheets on mobile (`dialogs-host.svelte` with `anchored="sheet"`) |

### Base layer

- `html`: `font-size: calc(100% * var(--text-scale, 1))` (Settings › Text & interface › Text size), Inter features `cv11`, `ss01`, antialiased.
- `body`: `bg-background-darkest text-foreground font-sans text-sm overflow-hidden`. `#app` fills `100dvw × 100dvh`.
- `:focus-visible`: 2px `var(--cottontail)` outline, 2px offset.
- `--overlay` on `html`: the shared scrim behind the start menu and every dialog, `background-darkest` at 60%.
- `::selection`: solid `primary` with `background` text, the primary button pair. A translucent `primary` left the light text unreadable on light fields.
- `h1`–`h3`: heading tracking, `text-wrap: balance`.
- Every element: thin scrollbars, thumb `foreground` at 22% on a transparent track.
- `prefers-reduced-motion: reduce`, and `html[data-motion="off"]` (Settings › Text & interface › Motion off): every animation and transition collapses to 1ms.

The desktop shell's root grid (`desktop-shell.svelte`) and the wallpaper layer (`desktop/wallpaper.svelte`, under the desktop and the mobile home) paint `background-darkest`.

## `cn()` and `tv`

`cn()` (`$lib/core/utils`) is `clsx` plus `extendTailwindMerge` with the custom tokens registered: `text-2xs` / `text-ui` as font sizes and the four shadows as shadows. Without that, tailwind-merge reads `text-ui` as a colour and drops it next to `text-foreground`. `tv` is `createTV()` from `tailwind-variants` with the same merge config; the UI kit's recipes (`button`, `field`, `badge` in `components/ui/variants.ts`) are built with it. New tokens that tailwind-merge doesn't know (a size, a shadow) have to be added to `TW_MERGE_CONFIG`.

## Palette disabled

`@theme inline { --color-*: initial; … }` deletes Tailwind's default palette. `bg-red-500`, `text-white`, `bg-black` and the rest generate nothing. The brand rule "don't add colours" is enforced at build time. The only colours that compile are the 17 theme tokens plus `mark-ears`. Neutral shades come from opacity modifiers (`text-foreground/65`, `bg-foreground/8`) and the surface ladder.

Hardcoded colours outside the token system, all deliberate:

| Where | Value | Why |
|-------|-------|-----|
| `index.html` body + `#splash`, `<meta name="theme-color">` | `#17252c` | Pre-boot, before any token exists. The brand requires splash and icon to be Brand Dark. |
| `vite.config.ts` PWA manifest `theme_color` + `background_color` | `#17252C` | Same |
| `index.html` `#splash-progress` (track, bar, label) | Brand Dark `background_lightest`, `primary`, `foreground` as OKLCH | Same: the boot progress bar shows before any token exists (ADR-036) |
| `core/compat/screen.ts` (browser support warning) | Brand Dark `background`, `background_light`, `background_lightest`, `foreground`, `primary`, `cottontail`, `warning`, `error` as hex | Shows before any token exists, in engines that may not parse `oklch()` (Firefox before 113) (ADR-067) |
| `--color-mark-ears` | fixed OKLCH | Logo ears are fixed by the brand |

Components that need a token outside a utility read the variable directly: in a `<style>` block (`var(--background-lighter)` for the `<select>` picker in `ui/select.svelte`), in the CodeMirror theme (`$kit/components/code/editor.ts`, ADR-048), or in an arbitrary value (`bg-[light-dark(var(--background-lightest),var(--background-darker))]` in the `field` recipe and Segmented). The Style Guide's swatches use `var(--{token})` with the kebab-case names.

## Built-in themes (`themes.ts`)

| Theme | How it's defined |
|-------|------------------|
| **Brand Dark** (`BRAND_DARK`) | 17 explicit OKLCH values. The default. |
| **Brand Light** (`BRAND_LIGHT`) | 17 explicit OKLCH values. UI only, never for the icon or splash. |
| 22 user presets | `derive_theme({ background, foreground, primary, secondary, accent })`, except While True: written out, because its orange desktop and white windows can't come from one base. All base colours are OKLCH. Group `projects` (Speed Reader Light and Dark, While True) gets its own "Project themes" grid in Settings |

`derive_theme()` spreads `derive_surfaces()` and follows the brand formula for the rest, leaving the derived tokens as live CSS expressions:

```ts
tertiary:   "color-mix(in oklch, var(--primary), var(--secondary))",
cottontail: "oklch(from var(--primary) calc(l + 0.2) calc(c * 1.34) h)",
success:    "oklch(from var(--primary) l 0.14 140)",   // warning 70, error 30, info 240
```

Because the stored value is the expression and not a resolved colour, editing `primary` or `background` in Settings re-derives the dependent tokens live. These strings are also what gets persisted.

**Older saves.** A save from before the ladder has no surface tokens. `merge_theme()` fills them from the brand palette whose `background` equals the saved one (Brand Dark or Brand Light), otherwise from `derive_surfaces()`. See [settings → Persistence](services/settings.md#persistence).

**Previews.** Settings' theme cards draw each preset in its own colours. They re-declare `--background`, `--foreground`, `--primary`, `--secondary` and `--accent` on the miniature only (not the whole card, so the card's own label and ring stay in the active theme), so the derived expressions resolve against the preset rather than the active theme.

The Settings app (Theme) applies a preset with `settings.theme = { ...preset.theme }` and edits single tokens on its Edit colours subpage: a text field and an `<input type="color">` per token, grouped Surfaces / Text and brand / States. The colour picker goes through native relative colour syntax (`settings/color.ts`): it shows `rgb(from <value> r g b)` as `#rrggbb` (out-of-gamut channels clipped), and a pick is stored as the computed result of `oklch(from <hex> l c h)`, read from a probe element. Stored values stay OKLCH. Picking a derived token replaces its live expression with a fixed colour, so that token stops following `primary` or `background`.

## Fonts

Self-hosted in `src/assets/fonts/`, with licences, and declared with `@font-face` (`font-display: swap`) in `app.css`:

| Family | File | Weights | Utility | Use |
|--------|------|---------|---------|-----|
| Inter | `InterVariable.woff2` | 100–900 (variable) | `font-sans` (body default) | Everything you read |
| Hack | `hack-regular.woff2`, `hack-bold.woff2` | 400, 700 | `font-mono` | Values (hex, IDs, sizes, paths, times) and the wordmark |

`tw-animate-css` is imported for animation utilities.

## Known gaps

- Font choice isn't built (the brand fixes Inter and Hack). Easing and durations are constants in `app.css`.
- There's no CSS fallback for the variables. A token can only be missing for the brief window before `SettingsService.init()`'s effect runs, and the splash covers it.
- Token values aren't validated. An invalid CSS string in `/etc/settings.json` or typed into Settings makes that variable invalid at computed-value time.
- Theme cards only re-declare the five base variables. `shadow-raised`, hairlines and edges inside a miniature still use the active theme's surface, because `<html>` resolves `--shadow-ink`, `--hairline` and the rest before they're inherited.
