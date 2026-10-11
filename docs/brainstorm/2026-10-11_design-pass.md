# Design pass

**Date:** 2026-10-11
**Participants:** Owner, Claude (as UI/UX designer)

## Context

The owner asked for a professional design pass over the whole OS and every app, following the lilBunnyRabbit brand, with proper design documentation and guidelines. There were two "vibe" references:

- **series-tracker:** light cream, calm and compact, 16px semibold headings with tight tracking, 12px muted captions, a soft tinted active pill, hairlines, rounded cards, a floating pill dock.
- **time-since:** the page on `background_dark`, a lighter bar, recessed inputs with no border, a 14px radius, a filled brand button with dark ink, a muted empty state.

The owner's mandate: go all in; the desktop background can change ("although I like the concept").

### Audit (before)

- The titlebar was a light `foreground` band on a dark OS.
- Windows had a heavy 2px light frame.
- Settings led with raw OKLCH text fields.
- Every app hand-rolled its controls; inconsistent sizes and states.
- Desktop icons were 64px cells with truncated labels.
- The taskbar was a flat full-width strip.
- The start menu was a centered list.

## Topics

| Question | Decision | Rejected |
|----------|----------|----------|
| Shared controls | Native UI kit + tailwind-variants in `core/components/ui/` | Class recipes only; bits-ui |
| Surface depth | The brand's 7-shade ladder as **explicit tokens per scheme** (owner: "don't derive, extend the colours per scheme"); five-colour presets still derive because they have no ladder | One derived formula for all; keep background + opacity |
| Window chrome | Quiet dark chrome | Brand-tinted focus; keep the light titlebar |
| Docs | `docs/design/` + a Style Guide app | Docs only; folded into `docs/system` |

### Design calls made as the designer (documented in docs/design)

- **Type:**
  - `text-ui` (13px) is the UI default.
  - `text-2xs` (11px) for captions.
  - Overline group labels.
  - Hack for values.
- **Radius:**
  - xs 4 to 2xl 18.
  - Windows and cards `rounded-xl` (14, as in time-since).
  - The dock and dialogs `rounded-2xl`.
- **Elevation:** shadows cast in `background-darkest`, so they stay on-palette in light themes.
- **Desktop:** kept the dot-grid concept on `background-darkest`, with a soft top glow, 88px cells, and raised icon tiles.
- **Taskbar:** a floating dock (series-tracker), with running indicators and a clock.
- **Start menu:** an anchored launcher with search and an icon grid.
- **Settings:**
  - theme preview cards rendered in each preset's own colours
  - the OKLCH customiser behind a disclosure
  - a Default apps page that finally lets you forget `file_defaults`
- **File Explorer:**
  - a real-path breadcrumb
  - a Places sidebar
  - a quieter list
  - empty and loading states
- **Text Viewer:** line numbers, a wrap toggle and copy.

### Independent review (round 2)

An outside reviewer, given only the goal and the brand, found a series of problems:
- contrast below AA from ad-hoc alphas
- mustard fields in light palettes
- collapsed derived ladders at pure black and white
- missing accessible names, and Segmented not being a real radio group
- the start menu search never got focus
- Text Viewer's wrap overflowing
- narrow-window overflow
- shell buttons outside the kit
- inspectors on the old type
- doc/code mismatches

The owner added two things they spotted themselves: a bigger gap above the dock than anywhere else, and the start menu blending into windows.

| Question | Decision | Rejected |
|----------|----------|----------|
| Secondary text contrast | `/80` for small text, `/65` only for 13px+ captions | Keep `/65` everywhere |
| Focus colour | Cottontail everywhere, as a documented exception | Primary in dark; a foreground ring |
| Logo colour | Keep the theme's primary | Fixed brand mark colour; neutral in light |
| Dismissing the restore question | It requires an answer (`dismissible: false`) | Esc keeps it for the next boot; leave as is |

Everything else was fixed as a plain bug.

## Key takeaways

1. The brand gives colour; the design system gives everything else, and it now lives in `docs/design`.
2. Depth comes from the ladder, never more than three shades per view.
3. Apps build from the kit. A pattern that two apps need goes into the kit and the Style Guide.

## Action items

- [x] Tokens, kit, shell, every app, Style Guide, docs/design, ADR-024
- [ ] Context menus (a kit `Menu` on popover + anchor positioning) for File Explorer and the desktop
- [ ] Window overlays (`confirm`/`prompt`) to replace native `prompt()`/`confirm()` in File Explorer

## Next session topics

- Motion for window open, close and minimize (ADR-014).
- A notification center panel from the taskbar.
