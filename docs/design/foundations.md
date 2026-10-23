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

### User colours

A colour the user picks for their own content is theirs, not the theme's, like the colours in a drawing. The one place UI takes it today is a Soundboard pad (owner exception, [brainstorm](../brainstorm/2026-10-20_soundboard-trim.md)): `color` is a token name or `#rrggbb`. Either way it goes into a `--pad` custom property (`var(--primary)` or the hex) and the tile uses the same alpha steps as the token tiles (`bg-(color:--pad)/18`, `ring-(color:--pad)/35`, `/38` playing). Chrome around it (the dialog, swatch rings, focus) stays on tokens.

### Opacity

Text uses four levels and nothing else:

| Level | Class | Use |
|-------|-------|-----|
| full | `text-foreground` | Body, titles, values |
| secondary | `text-foreground/80` | Small text: 11px descriptions, metadata, column headers, status bars (passes AA) |
| muted | `text-foreground/65` | Brand muted: 13px+ captions and descriptions, decorative icons. Not for 11px text |
| disabled | `opacity-38` | Disabled controls only |

Filled buttons use the brand modifiers: hover `opacity-85`, active `opacity-70`. Neutral states use foreground fills: hover `bg-foreground/6`–`/8`, selected `bg-foreground/10`.

Edges come from the surface, in the background's own hue, never from `foreground` (whose hue can be far off: Dark Purple's text is hue 60 on a hue 300 body). Decorative hairlines are `hairline` (`ring-hairline`, `border-hairline`, `divide-hairline`), `hairline-strong` where it has to hold against a busy backdrop (focused window, popovers, dock separators). Control edges (fields, segmented, switch track, checkbox) rest on `hairline-strong` and let the well's depth carry the shape; hover brings `edge`, solved for 3:1 non-text against the field and every surface a field sits on, and focus the `cottontail` ring (owner's call 2026-10-24: soft at rest over a 3:1 resting outline). See Soft surfaces for how they're derived. The brand's `border` modifier (0.76) is for edges that must stand out on every shade.

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
| lightest | `bg-background-lightest` | App tiles inside floating layers (start menu, phone drawer, announcements), so they stay lighter than the `lighter` panel; specimens |

**Scrim:** every floating layer that takes focus (start menu, menus, dialogs) sits on `--overlay`, the darkest shade at 60%. Centered questions also blur what's behind. Toasts don't use it: they don't take focus.

**Three shades per window or panel, at most.** The desktop and dock are the frame around them and don't count. A typical app uses `background` + `background-light` (chrome, cards) + its fields.

**Fields** use `bg-field` (`light-dark(color-mix(in oklch, var(--background), var(--background-dark)), var(--background-darker))`): half a step below the window body in light palettes, two steps in dark ones, so a field never matches the surface it sits on, with `shadow-recessed` and the `edge` ring so it reads as sunk in rather than as a darker button. `color-scheme` follows the palette, so `light-dark()` picks the right one. Segmented and switch tracks use it too.

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

- Display sizes are reserved in chrome (titles, toolbars, dialogs) for the introduction. In app content they're fine where the content is the point, such as a drawn result in RNG Tools.
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

The px values are the Default corners. Settings › Text & interface › Corners scales all of them by 0.4 (Sharp) or 1.5 (Round) through `--radius-scale`; `rounded-full` stays a circle. Use the tokens, not arbitrary `rounded-[…]` values, so a surface follows the setting.

## Elevation

Shadows are cast in `--shadow-ink`: the window body's hue at 30% of its lightness and muted chroma, never black and never a saturated darkest shade (While True's orange desktop, Red & Black's red no longer glow). Dark palettes take it at full weight, so a field or a tile on the desktop still casts; light palettes take it at 45%, so paper doesn't go grey.

| Token | Use |
|-------|-----|
| `shadow-raised` | Icon tiles, the selected segment, small lifted chips |
| `shadow-popover` | Menus, toasts, dialogs, the taskbar (includes a `hairline-strong` ring) |
| `shadow-window` | Unfocused windows |
| `shadow-window-focused` | The focused window |

### Soft surfaces

WebOS borrows the tactile half of neumorphism and keeps the surface ladder (brainstorm 2026-10-23_soft-surfaces). Raised things catch light on their top edge, recessed things take an inner shadow, buttons sink when pressed.

Every edge and shadow is derived from the surface it belongs to, in the background's hue, through relative OKLCH (`oklch(from var(--…) …)`) and `light-dark()`. No new colour, nothing tinted by the foreground. The tokens live on `html` in `app.css`; the `@theme` names make them utilities.

| Token | Utility | Derived as |
|-------|---------|------------|
| `--edge-control` | `ring-edge` | Solved for 3.1–3.2:1. OKLCH lightness cubed is close to luminance, so `pow()` turns the target ratio into a lightness: dark palettes go up from `background-lighter` (the lightest surface a field sits on), light ones down from `background-dark` (darker than any field). Hue of that shade, chroma ×0.7. Clamped at black or white where the palette has no room |
| `--edge-control-hover` | `ring-edge-hover` | The same at 4.4–4.5:1 |
| `--hairline` | `ring-hairline`, `border-hairline`, `divide-hairline`, `bg-hairline` | The body's hue pushed to the far end (light: lightness ×0.3; dark: 75% of the way to white), see-through so one token works on every shade. Alpha 0.10, rising to 0.18–0.22 near pure black or white and on mid-tone light bodies |
| `--hairline-strong` | `ring-hairline-strong`, `bg-hairline-strong` | The same ink at 0.16–0.32 |
| `--shadow-ink` | (inside every `shadow-*`) | Body hue, lightness ×0.3, chroma ×0.5–0.6; 45% alpha in light palettes |
| `--edge-lit` | (inside `shadow-lit`, `-raised`, `-control`, `-popover`) | A see-through highlight always lighter than what it lies on. Dark: 70% toward white at 0.16. Light: one step up (at most 0.12) at 0.85, chroma fading to neutral near white. Primary and danger buttons swap in their own fill +0.1 lightness, so a filled button never gets a dark notch or a glaring white line |
| `--raised` | `bg-raised` | Secondary button fill: paper lifted above the surface, never a hole. Dark: the hairline ink at 0.10. Light: one step up (at most 0.10) at 0.7 |
| `--raised-hover` | `bg-raised-hover` | Dark 0.15; light one step further, opaque |

Where light or shadow has no headroom (Neon Black's body is pure black, Electric White's pure white), the hairline firms up and a crisp outline carries the shape: tiles, cards, windows and secondary buttons all have one.

| Token | Use |
|-------|-----|
| `shadow-lit` | The lit edge alone: titlebars, toolbars. `shadow-raised`, `shadow-card` and `shadow-popover` include it |
| `shadow-card` | Section cards and panels in a window: lit edge and a wide, faint drop, so they float without reading as buttons |
| `shadow-control` | Buttons (`primary`, `secondary`, `danger`), the selected segment, the active side-nav item, a checked checkbox, switch and slider knobs, `Kbd` keycaps: lit edge and a short drop. Secondary adds a `hairline` ring |
| `shadow-pressed` | A button while held, a toggle that's on (`pressed`), the active taskbar item, an app tile while its own button is held (`group-active/tile:`) |
| `shadow-recessed` | Fields, segmented tracks, switch tracks, an unchecked checkbox: a deep inner shadow and a lit bottom lip |
| `shadow-track` | Slider grooves (6px, `bg-field`), where a groove can't take the field's drop |
| `bg-knob` (`--knob`) | Switch knob and slider thumb: `background-lightest` in light palettes, foreground mixed 88% into the body in dark ones, where paper is too dark to read |

Rules:

- Pressed and on use the same sink. Held buttons also move down 1px (`active:translate-y-px`); disabled buttons lose their shadow.
- Controls are soft at rest: `ring-hairline-strong` plus the well's depth. Hover adds `ring-edge` (3:1), focus the `cottontail` ring. Raised parts on a control (selected segment, knobs, a checked checkbox) take `shadow-control`.
- Tiles in a floating layer (start menu, phone drawer, announcements) are `background-lightest`, one above the `lighter` panel, so a raised tile never reads as sunk.
- Selection and on-state keep `primary`. Lists, tables, the terminal, editors and canvases stay flat: dense content would turn every row into a button.
- Settings › Shadows scales the drops and inner shadows; the lit edge isn't a shadow and stays.

Settings › Text & interface › Shadows multiplies the darkest-shade opacity: None 0, Subtle 0.5, Default 1, Strong 1.4 (capped at 100%). Hairlines stay. Text size (Small 15px, Medium 16px, Large 17px root) scales everything set in rem, so design in rem, not px, for anything that should grow with it.

Hairlines are `ring-1 ring-hairline` (or `border-hairline` / `divide-hairline` for dividers). Focused windows get `ring-hairline-strong`.

## Motion

- Default: 150ms, `--ease-out` (`cubic-bezier(0.22, 1, 0.36, 1)`), on colour, opacity and small transforms.
- Entrances: `animate-pop-in` (160ms, fade plus 0.97→1 scale) for menus, dialogs and snap previews.
- Layout moves (snap): 200–250ms.
- Windows: open 140ms / close 100ms (fade + 0.96→1 scale); minimize, maximize and snap are View Transition morphs (browser default, ~250ms).
- `prefers-reduced-motion`, or Settings › Text & interface › Motion off (`html[data-motion="off"]`), collapses all of it to 1ms in the base layer. Script-driven motion (Svelte transitions, View Transitions) checks `motion_reduced()` and skips.

## App icons

Every app draws its own icon in `icon.svg` next to its manifest (`import icon from "./icon.svg?no-inline"`, then `icon,`). The rules, settled with the owner in [app wave 7](../brainstorm/2026-10-17_app-wave-7.md):

- 24 grid, one 1.5 px line in `currentColor`, round caps and joins, `rx` 2 on rectangles, drawn to fill about 18–20 units.
- One idea per app, the thing that app is about, in a handful of shapes. No text, tiny details or decoration. Core (system) apps are the plainest: one object in 3–5 strokes, never a scene.
- Colour is rare (25 of 94): only on the element the app is about (the lander's flame, the dragged card), in `primary` or `secondary`, solid with no outline. It stands outside the line drawing: never inside an outline, never touching a line, at least 1.5 units clear. Primary and secondary never touch; accent and state colours never appear.
- An app that needs on-device AI to work at all carries a `primary` sparkle in the top-right corner, the glyph cut away 1.5 units around it ([decided](../brainstorm/2026-10-21_ai-icon-mark.md)): Ask, Unsaid, Doodlehop and Alibi. Copy the `<defs>` mask, the `mask="url(#ai)"` on each element and the sparkle path from one of them. Keep that corner free of the app's own colour element: Doodlehop's dot moved left to make room. An app where AI is optional (Warren, Shopping List) keeps its plain icon.

### The file

`AppIcon` (UI kit) draws the file as three CSS masks over one box: `icon.svg` in `currentColor`, `icon.svg#primary` in `--primary`, `icon.svg#secondary` in `--secondary` ([ADR-066](../adrs/066-app-icons-as-files.md)). A mask reads only alpha, and a `var()` doesn't resolve inside an image, so the colour lives in the class, never in the file. Every `icon.svg` starts the same way:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
  <style>.primary,.secondary,:target~*{display:none}#primary:target~.primary,#secondary:target~.secondary{display:inline}</style>
  <view id="primary"/><view id="secondary"/>
  <g fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">…</g>
  <circle class="primary" cx="19" cy="19.75" r="1.75" fill="currentColor"/>
</svg>
```

- With no fragment the style hides the `.primary` and `.secondary` elements; with `#primary` (or `#secondary`) it shows only those. A file without the views would draw its whole art in every layer.
- Colour elements are direct children of the `<svg>`, after the views, and use `currentColor` like the rest.
- No width, height or `aria-hidden`: `AppIcon` sizes the box (`1em` unless a `size-*` class says otherwise) and hides it from assistive tech.
- `src/lib/apps/icons.test.ts` checks every file against this.

Until the file has loaded, `AppIcon` shows a rounded `foreground/10` square. A drawn icon is in the memory cache, so later draws show it at once. A slot that takes an icon component (menu items, `EmptyState`) gets one from `app_icon(manifest.icon)` (`$lib/core/components/ui/app-icon`). Icons ignore Phosphor's `weight`.

## Icons

Phosphor (`phosphor-svelte`) for everything that isn't an app icon, imported with an `Icon` suffix.

| Weight | Use |
|--------|-----|
| `regular` | Default |
| `bold` | Small toolbar and control icons (≤16px), so they hold their weight next to `text-ui` |
| `duotone` | Empty states, file types, feature cards |
| `fill` | The selected item in a nav or the focused taskbar app |

`thin` and `light` aren't available: a build plugin (`vite-plugin-phosphor.ts`) strips them from every icon component to keep the boot chunk small, and they render as `regular` (ADR-036).

Sizes: `size-3.5` in small controls, `size-4` in rows and toolbars, `size-5`–`size-6` in tiles.

## Focus

Every interactive element shows `:focus-visible` as a 2px `cottontail` outline (base layer) or `ring-2 ring-cottontail` for recessed fields and rows. Never remove focus without a replacement.

## Theming notes

- `color-scheme` follows the active palette (light when the background lightness is above 0.6), so scrollbars and native pickers match.
- Theme previews re-declare the base tokens on the preview element, so derived tokens resolve to the preset, not to the active theme.
