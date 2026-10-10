# Theming

Source: `src/app.css`, `src/lib/core/api/services/settings/themes.ts`, `settings/service.svelte.ts` · ADR: [ADR-015](../adrs/015-customization-theming.md) (see its 2026-10-10 revision) · Brand: [lilBunnyRabbit brand](https://lilbunnyrabbit.github.io/brand/), rules summarized in [CONVENTIONS → Styling & brand](../CONVENTIONS.md#styling--brand)

## The pipeline

```
SettingsService.theme  ──($effect)──►  <html style="--background: …; --primary: …">
                                              │
src/app.css  @theme inline { --color-primary: var(--primary); … }
                                              │
Tailwind utilities  bg-primary · text-foreground/65 · border-error …
```

1. `SettingsService.theme` is a `Record<ThemeToken, string>` holding 11 tokens.
2. An effect started in `SettingsService.init()` calls `document.documentElement.style.setProperty("--{token}", value)` for every token whenever `theme` changes. The variables live as inline style on `<html>`. Nothing in CSS defines a default, so before the service inits, `var(--primary)` and the rest are unset.
3. `app.css` maps each variable into a Tailwind colour under `@theme inline`. `inline` makes the utility reference `var(--primary)` directly, so a runtime change applies immediately with no rebuild.

## Tokens

| CSS var on `<html>` | Tailwind colour | Source |
|---------------------|-----------------|--------|
| `--background` | `background` | theme |
| (none) | `background-dark` | `color-mix(in oklch, var(--background) 80%, black)`, derived in CSS |
| `--foreground` | `foreground` | theme |
| `--primary` | `primary` | theme |
| `--secondary` | `secondary` | theme |
| `--tertiary` | `tertiary` | theme |
| `--accent` | `accent` | theme |
| `--cottontail` | `cottontail` | theme. Also the global `:focus-visible` outline colour |
| `--success` `--warning` `--error` `--info` | same names | theme |
| (none) | `mark-ears` | fixed `oklch(0.949 0.0939 122.47)`, the same in every theme (logo only) |

What each token is for (brand semantics): [CONVENTIONS → Themes and tokens](../CONVENTIONS.md#themes-and-tokens).

Other `@theme` entries:

- `--font-sans: "Inter", …` and `--font-mono: "Hack", …`
- `--radius-sm|md|lg|xl` from `:root { --radius: 0.625rem }`. It's constant: there's no setting for it.
- `--shadow-window`, two layered shadows tinted from `var(--background)`.

Base layer: `body` gets `bg-background text-foreground font-sans overflow-hidden`, `#app` fills `100dvw × 100dvh`, and `:focus-visible` gets a 2px `var(--cottontail)` outline with 2px offset. The utilities layer sets the body scrollbar colours from `--background` and `--foreground`. The OS root grid (`os.svelte`) paints `bg-background-dark`.

## Palette disabled

`@theme inline { --color-*: initial; … }` deletes Tailwind's default palette. `bg-red-500`, `text-white`, `bg-black` and the rest generate nothing. The brand rule "don't add colours" is enforced at build time. The only colours that compile are the 13 listed above. Shades come from opacity modifiers (`text-foreground/65`, `bg-primary/20`) and `background-dark`.

Hardcoded colours outside the token system, all deliberate:

| Where | Value | Why |
|-------|-------|-----|
| `index.html` body + `#splash`, `<meta name="theme-color">`, PWA manifest `theme_color` + `background_color` | `#17252c` | Pre-boot, before any token exists. The brand requires splash and icon to be Brand Dark. |
| `vite.config.ts` PWA manifest `theme_color` | `#17252C` | Same |
| `--color-mark-ears` | fixed OKLCH | Logo ears are fixed by the brand |
| `background-dark` mix | `black` | CSS keyword inside `color-mix`, not a Tailwind colour |

## Built-in themes (`themes.ts`)

| Theme | How it's defined |
|-------|------------------|
| **Brand Dark** (`BRAND_DARK`) | 11 explicit OKLCH values. The default, and the merge base when loading. |
| **Brand Light** (`BRAND_LIGHT`) | 11 explicit OKLCH values. UI only, never for the icon or splash. |
| 21 user presets | `derive_theme({ background, foreground, primary, secondary, accent })`. All base colours are OKLCH. |

`derive_theme()` follows the brand formula and leaves the derived tokens as live CSS expressions:

```ts
tertiary:   "color-mix(in oklch, var(--primary), var(--secondary))",
cottontail: "oklch(from var(--primary) calc(l + 0.2) calc(c * 1.34) h)",
success:    "oklch(from var(--primary) l 0.14 140)",   // warning 70, error 30, info 240
```

Because the stored value is the expression and not a resolved colour, editing `primary` in Settings re-derives these tokens live. These strings are also what gets persisted.

The Settings app (Theme section) applies a preset with `settings.theme = { ...preset.theme }` and edits single tokens through a text field and an `<input type="color">`. The colour picker goes through native relative colour syntax: it shows `rgb(from <value> r g b)` as `#rrggbb` (out-of-gamut channels clipped), and a pick is stored as `oklch(from <hex> l c h)`, read back resolved from a probe element's computed style. Stored values stay OKLCH. Picking a derived token replaces its live expression with a fixed colour, so `primary`-based states stop following `primary` for that token.

## Fonts

Self-hosted in `src/assets/fonts/`, with licences, and declared with `@font-face` (`font-display: swap`) in `app.css`:

| Family | File | Weights | Utility | Use |
|--------|------|---------|---------|-----|
| Inter | `InterVariable.woff2` | 100–900 (variable) | `font-sans` (body default) | Everything you read |
| Hack | `hack-regular.woff2`, `hack-bold.woff2` | 400, 700 | `font-mono` | Values (hex, IDs, sizes, code) and the wordmark |

`tw-animate-css` is imported for animation utilities.

## Known gaps

- ADR-015's non-colour theming (radius, shadows, animation speed, font choice, export/import) isn't built.
- There's no CSS fallback for the variables. A token can only be missing for the brief window before `SettingsService.init()`'s effect runs, and the splash covers it.
- Token values aren't validated. An invalid CSS string in `webos.settings` or typed into Settings makes that variable invalid at computed-value time.
