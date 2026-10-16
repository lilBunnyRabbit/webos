# Components

The UI kit lives in `src/lib/core/components/ui/` and is imported from `$lib/core/components/ui`. Everything is built on native elements; variants come from `tailwind-variants` (`ui/variants.ts`, using `tv` from `$lib/core/utils` so it shares `cn()`'s merge rules). See every one live in the Style Guide app.

| Component | What | Notes |
|-----------|------|-------|
| `Button` | Text button | `variant`: `primary` (one per view), `secondary` (default), `quiet` (toolbars, low emphasis), `danger` (destructive only). `size`: `sm` 28px, `md` 32px, `lg` 40px; on a coarse pointer (`pointer-coarse:`) `sm` is 36px and `md` 40px, so touch targets fit a finger without a mobile flag. Fields and `Segmented` grow the same way. Icons go first, `weight="bold"`. `pressed` makes it a toggle (see below) |
| `IconButton` | Icon-only button | `label` is required: accessible name and tooltip. Defaults to `quiet`. Takes `pressed` too |
| `CopyButton` | Copy a value to the clipboard | An `IconButton` (`sm` by default) that copies `text` through the clipboard service, shows a green check and "Copied" for 1.2s, and is disabled while `text` is empty. A refused copy is an error toast from the app, so it lives inside an app window. `label` names what it copies ("Copy password") |
| `Input` | Text field | The field surface (`light-dark()`, see foundations) with a `foreground/30` ring, `leading` / `trailing` snippets for an icon or a clear button. Sizes match `Button` |
| `Textarea` | Multi-line field | The same field surface, at least 96px tall and resizable vertically; the recipe's fixed heights (touch included) are reset. `mono` for code and data: Hack, no spellcheck, autocapitalize or autocomplete. Prose stays Inter. `bind:value`, `bind:element` |
| `Select` | Native `<select>` | `appearance: base-select`, so the popup is styled and keyboard, positioning and form behaviour stay native. Layout is utility classes (no scoped `display`), so `class="hidden @lg:flex"` works on it |
| `Slider` | A value on a range: volume, a position, a brush size | A native `<input type="range">`, so keyboard, ARIA and pointer handling are the platform's. A 4px track filled with `primary` up to the value, a `foreground` thumb. `size`: `sm` 28px, `md` 32px tall (36 / 40px on touch, with a bigger thumb), so it lines up with the controls beside it. `bind:value`, or `value` + `oninput` for a seek bar |
| `Switch` | On/off that applies immediately | A `role="switch"` checkbox |
| `Checkbox` | A choice that applies on submit | `accent-primary` |
| `Segmented` | Pick one of 2–4 short options | A real radio group (shared `name`): one Tab stop, arrow keys move the choice. Takes `id` / `aria-describedby` from a `SettingRow`. `size`: `md` (default, 32px, matches `md` controls) or `sm` (28px, 36px on touch) in a toolbar next to `sm` buttons |
| `ResizeHandle` | A splitter between two panes the user sizes: Hopsprite's colour panel and filmstrip | The ARIA window-splitter pattern: a focusable `role="separator"` with `aria-valuenow`. Drag (pointer capture, previews once per frame through `onpreview`, saves on release through `oncommit`), arrow keys in 16px steps, Home folds, End maximises, Enter or double-click folds and unfolds. Dragging past half of `min` folds to `rest`. `axis` `row` or `column`; `grows_backward` (default) when the pane sits after the handle. A 1px hairline with a 12px hit area (24px on touch); `primary` on hover and drag, `cottontail` on focus. It owns no size: the caller stores it |
| `Section` | A titled group on a page | Title, description, `actions` snippet; content sits in a `rounded-xl` card with dividers, or `flush` for none |
| `SettingRow` | Label, description and a control | Stacks below `@md`. Its `children` snippet receives `{ id, describedby }`; put them on the control so it gets its name and description: `{#snippet children({ id, describedby })}<Switch {id} aria-describedby={describedby} />{/snippet}` |
| `SideNav` | An app's section navigation | Sidebar at `@2xl`, tab row below. Active item is `foreground/10` with a filled primary icon. An optional `count` per item sits at the end in mono `text-2xs` (App Library's categories) |
| `Toolbar` | An app's top bar | At least 44px, `bg-background-light`, hairline below. `role="toolbar"`. Wraps onto more rows when a phone is too narrow: give the part that should stretch `flex-1` and a `min-w-*` |
| `StatusBar` | Footer metadata | 28px, mono `text-2xs`, muted. No important actions |
| `Badge` | A short label or status | `tone`: neutral, primary, success, warning, error, info (tinted fill + ink) |
| `EmptyState` | Nothing to show, an error, or a first run | Icon tile, title, one line of help, optional actions. `tone="error"` for failures |
| `BoardOverlay` | A game's pause or end screen | Covers its positioned parent (the board) with `background/80` and a 2px blur, fades in, and announces itself (`aria-live`). `title`, an optional mono `detail` line (the score), actions as children with the primary one last. Takes the board's radius (`rounded-[inherit]`); pass `class` for another radius or a z-index. See [Game app](patterns.md#game-app) |
| `Spinner` | Indeterminate wait | Has a `label` for screen readers |
| `Kbd` | A key | Mono, `rounded-xs` |
| `Separator` | A hairline | `vertical` for toolbars |

Class recipes (`button`, `field`, `badge`) are exported too, for elements that must look like a control without being one (a link that reads as a button).

## Toggles

A button that stays on (a tool, a panel, a view option, a flag) is a `Button` or `IconButton` with `pressed`. It sets `aria-pressed` and the selection tint: `primary/15` fill with `primary` ink, `primary/20` on hover, whatever the variant (use `quiet`). The label stays the same when it toggles; say the action ("Statistics", "Wrap lines"). A choice of one among several (Paint's tools) is a row of pressed buttons when they're icons; with words, use `Segmented`.

## Rules

- **One primary action per view.** Everything else is secondary or quiet.
- **Labels are verbs** that say what happens: "Restore windows", "Forget all", "Check now". Not "OK" / "Submit".
- **Destructive actions** use `danger` and name the thing: "Reset", "Delete folder".
- **Icon-only buttons** only for universally understood actions (back, reload, close, zoom, upload), and always with `label`.
- **Don't nest cards.** A `Section` card holds rows, not more cards.
- **The shell uses the kit too.** Titlebar controls, toast dismiss and the start menu's pin are `IconButton`s.
- **Questions require an answer.** Show them with `dialogs.show(..., { dismissible: false })`; menus stay light-dismiss.
- **Disabled is rare.** Prefer hiding an action that can't apply, or explaining why in the description.

## Adding a component

1. It's needed by two or more apps (or the shell).
2. Build it on the native element; check whether a platform feature already does the hard part.
3. Add it to `ui/index.ts`, document it in this table, and show it in the Style Guide.
