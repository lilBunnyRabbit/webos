# Patterns

How apps are put together. The app's root fills the window content, which is an `@container`, so layouts respond to the window size with container queries (`@md`, `@2xl`, …), never viewport breakpoints.

## App frames

**Document or viewer app** (File Explorer, Text Editor, Media Preview):

```
┌ Toolbar ──────────────────────────────┐  bg-background-light, 44px
│ content                               │  bg-background (or background-darker for media)
├ StatusBar ────────────────────────────┤  bg-background-light, 28px, mono metadata
```

`grid h-full grid-rows-[auto_1fr_auto]`; the middle row scrolls (`min-h-0 overflow-auto`).

A notice about the open document (Text Editor's "changed on disk") is a strip between toolbar and content: `bg-warning/10`, hairline below, a filled warning icon, one sentence in `text-ui`, then `sm` buttons (secondary, then the primary action last).

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

## Game app

Tic-Tac-Toe, Minesweeper, 2048, Snake and Maze share one frame:

```
┌ Toolbar ─────────────────────────────────────┐  mode or difficulty (sm Segmented; a Select in narrow windows), stats toggle, New game (primary)
│        ┌──────────┐  ┌ stats ┐               │
│        │  board   │  │ panel │               │  square board, centered; stats panel at @3xl, a pressed toggle below
│        └──────────┘  └───────┘               │
│        status line                           │
├ StatusBar ───────────────────────────────────┤  score, best, the keys
```

- **Board:** square and as large as the window allows (sized in `cqmin`), with a `foreground/8` hairline. It takes the keyboard: a focusable `role="application"` (Snake, Maze) or a `role="grid"` of cells (Tic-Tac-Toe, Minesweeper), with an `aria-label` that names the keys.
- **Status line:** one short line under or over the board for whose turn it is or what just happened, `text-ui`, `aria-live="polite"`. Numbers that change go in the status bar in mono.
- **Stats panel (optional, Tic-Tac-Toe and Minesweeper):** a side panel from `@3xl` (wins, best times, streaks). Below that, a `pressed` "Statistics" `IconButton` in the toolbar shows it over the board.
- **Pause and end:** a `BoardOverlay` inside the board: the title ("Paused", "Game over"), one mono line (score, best), the primary action (Resume, Play again, New game) last. Starting cues that must not hide the board (Snake's "swipe to start") sit at its edge instead.
- **Touch:** swipes on the board; a direction pad only on `pointer-coarse`. Touch targets stay the kit's 36px; a dense board (Minesweeper Expert) may go down to 32px cells.

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

## Selection and drag

The desktop and File Explorer select the same way (`$lib/core/utils/selection.ts`).

- Click selects one; Ctrl/Cmd+click toggles; Shift+click selects the range from the last clicked; Ctrl/Cmd+A selects all; Esc clears.
- Drag on empty space draws the marquee: `primary/12` fill, `primary/60` hairline, `rounded-sm`. Ctrl/Cmd keeps what was selected.
- Selected items are `primary/14`. Keyboard focus is the ring only, so focus and selection never look alike.
- Right-click on a selected item acts on the whole selection; on an unselected one, it selects that one first. Menus say the count ("Delete 3 items"); actions that need one item (Rename, Properties, Save to disk, Open with) disappear for many. Deleting many asks once.
- Dragging moves. Dragged items fade to 40%; a folder under the drag is the target (`primary/18`, `primary/70` 2px ring). Name clashes on a drop keep both, without asking.
- Pointer only: phones and tablets keep tap and long press.
- Files dragged in from the computer are copied in, not moved, onto the same targets with the same highlight. No confirmation, no progress; failures toast.

## Dialogs and menus

- **Menus at the cursor** (Open with): `rounded-xl bg-background-lighter p-1.5 shadow-popover`, an overline title, 36px items with icon tiles, on the shared scrim.
- **Questions** (Restore session): centered, `rounded-2xl p-5`, a tinted icon tile, a title phrased as a question, one line of context, then actions right-aligned: quiet dismiss, primary confirm (autofocused). The OS behind is dimmed and slightly blurred.
- Both enter with `animate-pop-in`. Menus dismiss with Esc or an outside click (`closedby="any"`). Questions are shown with `dismissible: false` (`closedby="none"`): only their buttons close them, so a stray click can't throw away a session.
- Floating layers sit on `background-lighter`, one step above window chrome, so they read as on top even over a window.

## Context menus

Built with `dialogs.menu(items, { anchor })`, never by hand. Order items by frequency: the default action first (Open), then variations (Open with), then edit actions (Rename, Copy, Cut, Paste), then destructive actions last after a separator. Destructive items are `danger`. Show the keyboard shortcut as a hint when one exists. Every right-clickable thing also opens its menu from the keyboard (ContextMenu key, Shift+F10).

## Window sheets

Questions that belong to one window's task (confirm, prompt, the file picker) are **sheets**: centred in that window on the shared scrim, the app behind them inert, the rest of the OS usable. Use `window.confirm` / `window.prompt` from the app context; never the browser's `confirm()` / `prompt()`.

- Confirm: a tinted icon tile, the question as the title (with the item's name in curly quotes), one line on consequences, then Cancel + the verb ("Delete"). `danger` makes the verb red and focuses Cancel.
- File picker: File Explorer in a `rounded-2xl` frame with a title bar on `background-lighter` showing what's accepted, sized to the window (`min(46rem, 100cqw - 2rem)`), with a footer of the chosen path, Cancel and Open. Unacceptable files stay visible but dimmed, so the folder still looks like itself.
- Prompt: the title, a large field with the current value selected (`select_stem` for file names), inline validation under the field, then Cancel + the verb ("Create", "Rename").

## Dates and times

`format_date()` and `format_datetime()` from `$lib/core/utils`: "Oct 11, 2026" and "Oct 11, 2026, 14:03". Times are 24-hour everywhere (the clock too). Don't call `toLocaleString()` directly.

## Copy

- Sentence case, plain words, no exclamation marks, no "please".
- Say what happened and what to do: "Couldn't read the file", "Nothing here is called "x"."
- Use the user's terms: "folder", not "directory"; "app", not "manifest".

## Keyboard shortcuts

- OS shortcuts use Alt+Shift (Option+Shift on macOS) for windows and Mod (Cmd/Ctrl) for launching: see [ShortcutsService](../system/services/shortcuts.md). Never bind plain Ctrl+Shift+W/T/N or Ctrl+W/T/N: the browser keeps them.
- Show keys with `Kbd` chips built by `format_keys(keys, shortcuts.mac)`: `⌘ ⌥ ⇧` on Apple devices, words elsewhere.
- An app's own shortcuts register with `window: window_id` and `category: "app"`, so they appear under "This app" in the Mod+/ cheat sheet.
