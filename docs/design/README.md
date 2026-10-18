# Design

How WebOS should look and feel, and why. The [lilBunnyRabbit brand](https://lilbunnyrabbit.github.io/brand/) sets the palette, fonts and hard rules. This folder fills in everything the brand leaves open (spacing, radius, elevation, motion, components, layout) and applies it to an OS.

The Style Guide system app renders every token and component live in the current theme. When this doc and the Style Guide disagree, the code is wrong or the doc is stale. Fix one of them.

## Principles

1. **Calm and compact.** Small type, generous space, few lines. Content leads; chrome recedes. Hierarchy comes from weight and shade, not from borders and colour.
2. **Dark is the brand.** Brand Dark is the default. Light themes are product UI only.
3. **Depth from the ladder.** Surfaces step through the brand's seven background shades: desktop at the bottom, windows in the middle, chrome and cards on top, inputs recessed. Never more than three shades in one view.
4. **Colour means something.** `primary` is selection, the main action and "this is the brand". States mean state. Everything else is `foreground` at an opacity.
5. **Use the platform.** Native `<dialog>`, popover, anchor positioning, customizable `<select>`, container queries. If the browser does it, we don't.
6. **Every app looks like one OS.** Apps build from the UI kit (`$lib/core/components/ui`) and the patterns here, not from bespoke Tailwind.

## Pages

| Page | Covers |
|------|--------|
| [foundations.md](foundations.md) | Colour roles, surface ladder, type scale, spacing, radius, elevation, motion, icons, focus |
| [components.md](components.md) | The UI kit: every component, its variants and when to use it; the app kit's `CodeView` |
| [patterns.md](patterns.md) | App layout, toolbars, games, lists, settings pages, empty and loading states, selection, paste and drop, dialogs and menus, copy |
| [shell.md](shell.md) | Window chrome, taskbar, start menu, desktop, toasts, the solo shell, mobile |

## Rules for changes

- UI work follows these pages. A new pattern that more than one app needs goes into the kit and gets documented here plus shown in the Style Guide.
- New tokens come from the brand (or are derived the brand's way). Never add a colour.
- Keep `docs/system/theming.md` (how theming works) and this folder (how things should look) in sync.
