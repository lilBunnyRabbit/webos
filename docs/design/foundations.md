# Foundations

Tokens live in `src/app.css` (`@theme inline`) and the theme palettes in `services/settings/themes.ts`. Use Tailwind utilities generated from them; never raw values.

## Colour roles

| Token | Use | Don't |
|-------|-----|-------|
| `foreground` | All text, icons, and neutral fills at an opacity (`foreground/6` hover, `/8` subtle fill, `/10` selected) | Pure white or black |
| `primary` | Selection, the one main action per view, focused-window indicator, the logo | Decoration, body text |
| `secondary`, `tertiary` | Supporting brand accents in illustrations and previews | Interactive states |
| `accent` | A rare, loud callout | Anything recurring |
| `cottontail` | Focus rings and markers, in every palette (a deliberate exception: the brand reserves dark-mode cottontail for badge ink, but it's the most visible ring on near-black) | Text, the logo |
| `success`, `warning`, `error`, `info` | State only: toasts, badges, validation, destructive actions (`error`) | Branding, decoration |

Brand rules that apply everywhere:

- Two brand colours never touch. Put space or a neutral surface between them.
- No white text on a brand fill: use `text-background` on `bg-primary` and friends.
- Nothing on pure white. Popovers and dialogs always set a surface (`bg-background-light`).
- No gradients between brand colours. Gradients between shades of the same surface are fine (the desktop glow).

### Tinted fills

For a coloured chip or icon tile, use the colour at 12–15% as the fill and the full colour as ink: `bg-error/12 text-error`. That's still one colour, not two touching.

### Opacity

Text uses four levels and nothing else:

| Level | Class | Use |
|-------|-------|-----|
| full | `text-foreground` | Body, titles, values |
| secondary | `text-foreground/80` | Small text: 11px descriptions, metadata, column headers, status bars (passes AA) |
| muted | `text-foreground/65` | Brand muted: 13px+ captions and descriptions, decorative icons. Not for 11px text |
| disabled | `opacity-38` | Disabled controls only |

Filled buttons use the brand modifiers: hover `opacity-85`, active `opacity-70`. Neutral states use foreground fills: hover `bg-foreground/6`–`/8`, selected `bg-foreground/10`.

Edges: decorative hairlines `foreground/8`–`/10`; control edges (fields, segmented, switch track) `foreground/30`–`/45` so the control is findable (3:1 non-text). The brand's `border` modifier (0.76) is for edges that must stand out on every shade.

## Surface ladder

Each palette defines the brand's seven background shades. Brand Dark and Brand Light list the exact brand values. Five-colour presets derive theirs from `background` in 0.034 lightness steps (the brand's own step).

| Shade | Utility | Where |
|-------|---------|-------|
| darkest | `bg-background-darkest` | Desktop, behind everything |
| darker | `bg-background-darker` | Recessed: inputs, media stages, inset lists in dialogs |
| dark | `bg-background-dark` | Rarely; glows and gradients |
| background | `bg-background` | Window content, the page an app draws on |
| light | `bg-background-light` | Chrome and raised things in a window: titlebars, toolbars, side nav, cards, the taskbar |
| lighter | `bg-background-lighter` | Floating layers above windows: start menu, menus, toasts, dialogs, select pickers |
| lightest | `bg-background-lightest` | Light palettes' fields (see below); specimens |

**Scrim:** every floating layer that takes focus (start menu, menus, dialogs) sits on `--overlay`, the darkest shade at 60%. Centered questions also blur what's behind. Toasts don't use it: they don't take focus.

**Three shades per window or panel, at most.** The desktop and dock are the frame around them and don't count. A typical app uses `background` + `background-light` (chrome, cards) + its fields.

**Fields** use `light-dark(var(--background-lightest), var(--background-darker))`: recessed in dark palettes, raised paper in light ones. A darker tan field on cream reads as a button. `color-scheme` follows the palette, so `light-dark()` picks the right one.

## Typography

Inter for everything you read, Hack (`font-mono`) for values: sizes, ids, paths, versions, colours, times.

| Role | Classes | Size |
|------|---------|------|
| Display (introduction only) | `text-3xl` / `text-2xl font-semibold` | 30 / 24px |
| App or page title | `text-lg font-semibold` | 18px |
| Card or dialog title | `text-base font-semibold` / `text-sm font-semibold` | 16 / 14px |
| Section heading | `text-sm font-semibold` | 14px |
| Reading text | `text-sm` | 14px |
| UI default: controls, rows, menus | `text-ui` | 13px |
| Captions, metadata, column headers | `text-2xs` | 11px |
| Overlines (group labels) | `text-2xs font-medium uppercase tracking-wide text-foreground/65` | 11px |

- Headings get `-0.011em` tracking and balanced wrapping from the base layer.
- Numbers that change or line up use `tabular-nums`.
- Sentence case everywhere ("Default apps", not "Default Apps").

## Spacing

Tailwind's 4px scale. The common steps:

| Use | Value |
|-----|-------|
| Inside a control | `px-2.5`–`px-3`, icon gap `gap-1.5` |
| Between controls in a toolbar | `gap-1.5` |
| Row padding in a card | `px-4 py-2.5`–`py-3` |
| Between sections in a page | `gap-6`–`gap-8` |
| App page padding | `px-6 py-6`, content `max-w-2xl`–`max-w-3xl`, centered |

## Radius

| Token | px | Use |
|-------|----|-----|
| `rounded-xs` | 4 | Checkboxes, keys |
| `rounded-sm` | 6 | Badges, tiny chips |
| `rounded-md` | 8 | Buttons, inputs, rows |
| `rounded-lg` | 10 | Nav items, segmented track, `lg` fields and buttons |
| `rounded-xl` | 14 | Windows, cards, icon tiles, toasts, menus |
| `rounded-2xl` | 18 | The taskbar, start menu, centered dialogs |

Nested corners shrink: a `rounded-xl` card holds `rounded-md` controls.

## Elevation

Shadows are cast in `background-darkest`, never black, so they stay on-palette in light themes too.

| Token | Use |
|-------|-----|
| `shadow-raised` | Icon tiles, the selected segment, small lifted chips |
| `shadow-popover` | Menus, toasts, dialogs, the taskbar (includes a hairline) |
| `shadow-window` | Unfocused windows |
| `shadow-window-focused` | The focused window |

Hairlines are `ring-1 ring-foreground/8`–`/10` (or `border-foreground/8` for dividers). Focused windows get `ring-foreground/16`.

## Motion

- Default: 150ms, `--ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`), on colour, opacity and small transforms.
- Entrances: `animate-pop-in` (160ms, fade plus 0.97→1 scale) for menus, dialogs and snap previews.
- Layout moves (snap): 200–250ms.
- `prefers-reduced-motion` collapses all of it to 1ms in the base layer.

## Icons

Phosphor only (`phosphor-svelte`), imported with an `Icon` suffix.

| Weight | Use |
|--------|-----|
| `regular` | Default |
| `bold` | Small toolbar and control icons (≤16px), so they hold their weight next to `text-ui` |
| `duotone` | App icons in tiles, empty states, file types |
| `fill` | The selected item in a nav or the focused taskbar app |

Sizes: `size-3.5` in small controls, `size-4` in rows and toolbars, `size-5`–`size-6` in tiles.

## Focus

Every interactive element shows `:focus-visible` as a 2px `cottontail` outline (base layer) or `ring-2 ring-cottontail` for recessed fields and rows. Never remove focus without a replacement.

## Theming notes

- `color-scheme` follows the active palette (light when the background lightness is above 0.6), so scrollbars and native pickers match.
- Theme previews re-declare the base tokens on the preview element, so derived tokens resolve to the preset, not to the active theme.
