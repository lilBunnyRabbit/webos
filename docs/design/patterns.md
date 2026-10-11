# Patterns

How apps are put together. The app's root fills the window content, which is an `@container`, so layouts respond to the window size with container queries (`@md`, `@2xl`, …), never viewport breakpoints.

## App frames

**Document or viewer app** (File Explorer, Text Viewer, Media Preview):

```
┌ Toolbar ──────────────────────────────┐  bg-background-light, 44px
│ content                               │  bg-background (or background-darker for media)
├ StatusBar ────────────────────────────┤  bg-background-light, 28px, mono metadata
```

`grid h-full grid-rows-[auto_1fr_auto]`; the middle row scrolls (`min-h-0 overflow-auto`).

**Settings-style app** (Settings, Style Guide):

```
┌ SideNav ┬ page ─────────────────────────┐
│ items   │  h1 text-lg                   │  max-w-2xl, px-6 py-6, gap-6
│         │  Section · Section · …        │
```

`flex h-full flex-col @2xl:flex-row`; the nav becomes a tab row in narrow windows. Persist the open section in app storage.

**Dashboard app** (Kernel, Example): a centered column (`mx-auto max-w-3xl`/`max-w-4xl p-6`) of `Section`s or cards.

## Toolbars

- Order: navigation (back, reload) → location (breadcrumb or title) → `flex-1` → filter → separator → actions.
- Controls are `size="sm"`. Icon buttons are `quiet`.
- A filter field narrows below `@lg` (`w-28`) rather than disappearing, so an active filter can always be seen and cleared.
- Status bars never wrap: they truncate and drop secondary items below `@sm`/`@md`.

## Breadcrumbs

Show the real path, not the history. `/` in mono, then each segment; the current one is `font-medium` and not clickable; separators are a small `CaretRight` at `foreground/35`.

## Lists and tables

- Rows are 32px (`h-8`), `rounded-md`, hover `bg-foreground/6`, keyboard focus `bg-primary/12` plus an inset cottontail ring.
- Column headers: sticky, overline style (`text-2xs uppercase tracking-wide text-foreground/65`), hairline below.
- Names in `text-ui`; sizes, dates and ids in mono `text-2xs text-foreground/65 tabular-nums`, right-aligned when numeric.
- Folders use `primary` with the `fill` weight; files are `duotone` at `foreground/70`.
- Hide secondary columns in narrow windows (`hidden @md:block`).

## Settings pages

- One `Section` per topic, each with a one-line description that says what it controls.
- Inside: `SettingRow`s (label left, control right). Switches apply immediately; no Save button.
- Destructive settings (reset) go last, in their own section, with a `danger` button and a description of exactly what's lost and what's kept.

## Empty, loading and error states

- **Loading:** `Spinner` centered for whole views; for lists, 5–6 skeleton rows (`bg-foreground/5 animate-pulse`) fading out downward.
- **Empty:** `EmptyState` with a duotone icon, a short title ("This folder is empty"), one line on what to do next, and an action when there's an obvious one.
- **Error:** the same component with `tone="error"`, saying what failed in plain words, with the technical message as the description.

## Dialogs and menus

- **Menus at the cursor** (Open with): `rounded-xl bg-background-lighter p-1.5 shadow-popover`, an overline title, 36px items with icon tiles, on the shared scrim.
- **Questions** (Restore session): centered, `rounded-2xl p-5`, a tinted icon tile, a title phrased as a question, one line of context, then actions right-aligned: quiet dismiss, primary confirm (autofocused). The OS behind is dimmed and slightly blurred.
- Both enter with `animate-pop-in`. Menus dismiss with Esc or an outside click (`closedby="any"`). Questions are shown with `dismissible: false` (`closedby="none"`): only their buttons close them, so a stray click can't throw away a session.
- Floating layers sit on `background-lighter`, one step above window chrome, so they read as on top even over a window.

## Window sheets

Questions that belong to one window's task (confirm, prompt, the file picker) are **sheets**: centred in that window on the shared scrim, the app behind them inert, the rest of the OS usable. Use `window.confirm` / `window.prompt` from the app context; never the browser's `confirm()` / `prompt()`.

- Confirm: a tinted icon tile, the question as the title (with the item's name in curly quotes), one line on consequences, then Cancel + the verb ("Delete"). `danger` makes the verb red and focuses Cancel.
- Prompt: the title, a large field with the current value selected (`select_stem` for file names), inline validation under the field, then Cancel + the verb ("Create", "Rename").

## Dates and times

`format_date()` and `format_datetime()` from `$lib/core/utils`: "Oct 11, 2026" and "Oct 11, 2026, 14:03". Times are 24-hour everywhere (the clock too). Don't call `toLocaleString()` directly.

## Copy

- Sentence case, plain words, no exclamation marks, no "please".
- Say what happened and what to do: "Couldn't read the file", "Nothing here is called "x"."
- Use the user's terms: "folder", not "directory"; "app", not "manifest".
