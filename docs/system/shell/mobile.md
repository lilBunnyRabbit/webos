# Mobile shell

Source: `src/lib/core/components/mobile/` · ADR: [ADR-016](../../adrs/016-mobile-support.md) (revisions 2026-10-12, 2026-10-25, 2026-10-25 hold to edit) · Brainstorms: [shell](../../brainstorm/2026-10-12_mobile-shell.md), [list home](../../brainstorm/2026-10-25_niagara-home.md)

The shell phones and tablets get. `load_shell()` (`components/platform-shell.ts`) imports it instead of `desktop-shell.svelte` when `kernel.platform` is `mobile`, and `os.svelte` renders what it loaded. That's the shell's one platform branch; below it, a few components and apps still read `kernel.platform` for touch behaviour (File Explorer's file list, Media Preview, App Library details, Activity Monitor's widgets section and several user apps). Each shell is its own chunk, so a phone never downloads the desktop shell and the other way round (ADR-036). Everything inside types against the mobile services: [`MobileWindowsService`](../services/windows.md#mobile) and [`MobileDesktopService`](../services/desktop.md#mobile-home). Try it on a desktop with `?platform=mobile`.

## Layout

```
mobile-shell.svelte        flex column, h-dvh, safe-area insets left/right, touch-action: manipulation
├─ DialogsHost anchored="sheet"   menus as bottom sheets, questions docked to the bottom; both swipe down
├─ main (stage)           container-type: size, isolate; the wallpaper (shell/desktop.md#wallpaper); logo mark watermark in the centre (any wallpaper but an image; a live wallpaper draws as the grid here, ADR-057)
│  ├─ mobile-home.svelte  clock, Recent, pinned list, All apps row
│  │  └─ letter-index.svelte  letter rail; the held-letter panel and the full app list (browse) over the home
│  ├─ mobile-windows.svelte  every running window; the switcher when open
│  └─ ToastArea           top, centred, below the safe area
└─ nav-bar.svelte         back, home, running apps
```

No WebOS status bar: the device shows its own. `index.html` sets `viewport-fit=cover` and `interactive-widget=resizes-content` (the layout shrinks above the soft keyboard, so fixed rows like the Terminal's key row stay visible), and the shell pads with `env(safe-area-inset-*)`: the home and each app pad the top, the nav bar the bottom.

## State

| What | Where |
|------|-------|
| Which app is on screen | `windows.get_focused()`. `null` = home |
| Full app list, switcher or edit mode open | [UiService](../services/ui.md) `overlay`: `launcher` (the letter panel's browse mode), `switcher` or `notifications` (also the switcher), `home-edit` (ADR-028) |
| A finger held on the letter rail | Local `scrub` in `letter-index.svelte` (letter, pointer, picked app): it only lives while the finger is down |
| Filter text, lit letter while browsing | Local in `letter-index.svelte`; the filter clears whenever the panel closes |

Two effects in the shell: a window coming on screen (a launch, a card picked, a file opened from elsewhere) closes the overlay, and `launcher` opening while an app is on screen (Mod+K, `ui launcher`, Getting started) sends the app home first, since the list is part of the home and sits under the windows. Going home leaves the overlay alone, so closing the on-screen app's card keeps the switcher open.

## Navigation

Buttons, not gestures: every screen edge belongs to the device (iOS: left edge back, bottom home indicator, top Control Center; Android: both edges back, bottom home).

| Button | Does |
|--------|------|
| Back | `ui.back()` ([ui](../services/ui.md#back)): closes the full app list, edit mode or the switcher; dismisses the top system dialog or menu, then the app's top sheet, when dismissible (a required one swallows back); asks the on-screen app (`windows.back(id)`, its `on_back` handlers, newest first); sends the app home (it keeps running). Nothing on home. The device's back gesture runs the same chain through the history guard |
| Home | Closes any layer and goes home |
| Running apps | Opens the switcher, or closes it (or the notification view of it). A `primary` badge shows the count of running apps; a `primary` dot (ringed in the bar colour) on the other corner means unread notifications |

Escape also closes an open layer, unless a menu or system dialog is up (a modal `<dialog>`: its Escape closes only itself). Every change runs through `view_transition()` (`$lib/core/utils/view-transition.ts`, shared with the desktop window motion): `document.startViewTransition` + `flushSync`, skipped under `prefers-reduced-motion` or Motion off (`motion_reduced()`). A rejected `ready` (hidden tab, a newer transition) is swallowed. The full app list opens and closes without one: it fades on its own, and a release on the rail must measure the held letter in the same frame.

## Windows and switcher

`mobile-windows.svelte` renders every window in `windows.list()` order, keyed, so switching modes never remounts an app.

- **Normal:** each window is `absolute inset-0`; only the focused one shows (`hidden` otherwise, still mounted, like a minimized desktop window). It runs `animate-pop-in` each time it appears. With nothing focused, the layer is `pointer-events-none` and home takes the taps.
- **Switcher:** the same elements become a horizontal scroll-snap row on the scrim with `backdrop-blur-xl`. Cards are the live windows: a box of `66cqw × 66cqh` holding the window at full stage size (`100cqw × 100cqh`) with `scale: 0.66` (`--card-scale`), `inert`. CSS `order` sorts them by `windows.recent()`, most recent first. Each has a header (icon, name, close button) and a transparent button over the card:
  - tap opens it;
  - a flick up past 96px closes the app (the card follows the finger and fades);
  - sideways is the browser scrolling the row (`touch-action: pan-x`). The first clear direction decides.
- **Notification center** (ADR-006 revision): with any notifications, the switcher opens with `NotificationList` on top (safe-area padded, at most `32cqh`, scrolling), cards on `bg-background-lighter shadow-raised`, and the cards shrink to `0.55`. The row's side padding is `(1 − scale) × 50cqw`, so a card always centres. Showing the list marks everything read and hides the toasts. Above the list, while background tasks run, an "N tasks running · Show" line (`NotificationList` `tasks` prop) launches Activity Monitor on its Tasks section; the mobile shell has no taskbar indicator ([tasks](../services/tasks.md)).
- "Close all" under the row; "No running apps" when empty.
- Each card has `view-transition-name: window-{id}`, so opening and closing the switcher morphs between card and fullscreen.

`mobile-window.svelte` is the window body: carries `data-window-id` like the desktop window (Activity Monitor observes it, dialogs anchor to it), sets the app context exactly like the desktop window, renders `WindowContent` (zoom 1, error boundary) and `WindowSheets`, pads the top safe area, and makes the app `inert` while a sheet is open. No titlebar.

## Home

`mobile-home.svelte` (2026-10-25, [brainstorm](../../brainstorm/2026-10-25_niagara-home.md)): one vertical list, Niagara-style, over the wallpaper. Labels sitting on the wallpaper carry `data-wallpaper-label`, so a photo wallpaper gives them a backing.

- **Clock:** a 24-hour `text-6xl` light time and the long date under it, ticking each minute (`Ticker`).
- **Recent:** up to four `AppRow`s (`components/apps/app-row.svelte`: a 44px tile with the app's icon and badge, the name in `text-xl`; dimmed when not saved for offline) from `apps.recent`, skipping apps pinned on home and apps not installed. Hidden when empty; dimmed to 40% and `inert` in edit mode (kept in the layout, so nothing under a held finger moves when edit mode opens). Long press: the shared `app_menu` with Clear recent.
- **Pinned:** `desktop.home()`, bottom-aligned (`mt-auto`) so a short home sits near the thumb. Shortcuts, files and folders are text rows: a 28px `ShortcutIcon` with its badge or a bare `FileIcon` (folders `primary` fill), the name in `text-2xl`, " · missing" in `error` for a shortcut to an unknown app. Tap opens through `desktop.open`.
- **Widgets** (2026-10-19): a full-width rounded frame `size.h × 104px` tall in the widget's style (`widget_surface`, shared with the desktop: card, glass or clear, ADR-034 revision 2026-10-21), the app's widget component inside (`components/desktop/widget-body.svelte`). No title strip: holding the frame (outside inputs) picks it up into edit mode like any entry. The width is the list's, so `size.w` only matters on the desktop. Each widget sits in an 8px vertical padding inside its row (not a margin), so every row's height is its own and the drag's slots add up.
- **All apps:** a quiet row at the end (`SquaresFour`, `foreground/65`) that opens App Library, the way to apps not installed yet. The letter list stays on the rail and `ui launcher` (Mod+K). Dimmed and `inert` in edit mode, like Recent.
- **Empty:** "Nothing pinned yet", with a line on finding apps on the letters and holding the background for a widget.
- The list scrolls under a 1rem top fade (`mask-image`), leaves room on the right for the rail, and goes `inert` (with the clock) while the letter panel is up.
- **Hold to edit** (2026-10-25, owner: "Cant we do it like apple has it"; `home-gesture.ts`, math in `home-drag.ts`): holding an entry or a widget 450ms (`HOLD_MS`, the slop is `long-press.ts`'s 16px) opens edit mode at once, with no menu in between: a vibration, the item lifts (`scale-[1.02]`, `shadow-popover`, entries on `background-light/90`) and the same touch carries on as a drag. Letting go without moving leaves it there, in edit mode. Moving before the hold is a swipe: the list scrolls as usual. A mouse right-click on an item opens the item menu instead; a mouse never holds.
  - **Why touch events.** Samsung Internet claimed a still finger as a pan before a pointer-based hold could fire and sent `pointercancel`, after which pointer events never resume (the 2026-10-13 removal, then the grips of 2026-10-19). Touch events keep coming after that, so the gesture runs on them: a non-passive `touchstart` on the list makes it a blocking touch region; while the hold is pending every `touchmove` inside the slop is cancelled, so a drifting finger never hands the browser a move to start a scroll with (past the slop it's a swipe and the browser gets the rest of the touch); once the hold fires every `touchmove` is cancelled (still cancelable, no scroll has started) and drives the drag, and the cancelled `touchend` stops the click. The move, end and cancel listeners sit on the touched node itself, because a touch keeps its first target even when edit mode re-renders around it. `touchcancel` drops the drag where it started. A touch `contextmenu` (Android's own long press, early on Samsung Internet) while the hold is pending picks up at once.
  - **Item menu** (`home-actions.ts`): a right-click, or a tap on an item in edit mode. Open, Edit home screen (Move up / Move down in edit mode, the keyboard's way to reorder; disabled at the ends), Style › Card / Glass / Clear (widgets only, current one checked; the sheet opens it inline), Rename, Delete / Remove shortcut / Remove widget, Uninstall… (shortcuts and widgets of user apps), Properties. Rename, delete and properties are `desktop-actions.ts`'s flows.
  - **Empty space menu:** hold the background (`$lib/core/utils/long-press.ts`): Edit home screen (not while editing) and Add widget, then the desktop's background menu (`background_menu(point, lead)`: New folder, Paste, Change wallpaper or theme). Sort by isn't offered: the home is an ordered list.
- **Edit mode** (2026-10-19, reworked 2026-10-25): the `home-edit` overlay in [ui](../services/ui.md), so Back, the device's back gesture and Escape leave it like any layer; opening the list or switcher, or an app coming on screen, ends it too, and so do Done and a tap on empty space (anything outside the items and the top row). The clock fades out and Add widget and Done (`primary`) take its place, so the list doesn't move; Recent and All apps dim, the rail hides. Every item jiggles (`animate-jiggle`: ±0.7° for entries, ±0.3° for widgets through `--jiggle`, alternating directions and staggered delays; no animation at all under reduced motion or Motion off, since the global 1ms cut would make it flicker).
  - **Drag the whole item.** In edit mode a press held 200ms (`PICK_MS`) picks an item up, so a quick swipe still scrolls; with a mouse, a press that moves 8px. Once it moves past 8px, every item's slot is measured (`offsetTop`/`offsetHeight`, untouched by the jiggle's rotation) and the item follows the finger by `translate`, clamped to the list. A neighbour steps aside by the item's height plus the gap (200ms ease-out) once the dragged item's leading edge crosses its middle, so the gap shows where it lands and a tall widget still reaches the end; each new spot vibrates. Within 64px of the list's top or bottom edge the list scrolls, up to 14px a frame. Letting go moves it through `move_item(name, before)` in the same update that drops the transforms.
  - **Remove badge:** a "−" in a 24px `background-lighter` circle (hairline, `shadow-raised`) on each item's top-left corner (the icon's corner on entries), 44px hit area; it runs the desktop's remove flow with its confirmation.
  - **Resize** (2026-10-19): a widget whose app has a `widget_size` gets a 32px `background-lighter` circle with `ArrowsVertical` in `primary` on its bottom-right corner (44px hit area, `touch-action: none`, pointer capture). Dragging it changes the height in whole 104px rows from where it started, clamped to the app's `min.h`–`max.h`, with a "N rows" chip and a vibration per row; losing capture writes a changed size through `desktop.resize_widget` (`w` kept). With the handle focused, ↓/↑ add or remove a row.
  - Widget bodies are `inert`; a transparent button over each one opens its menu. Add widget: a menu of installed apps with a widget; the pick is pinned at its default size and lands at the end.

### Letter rail and full app list

`letter-index.svelte`: a 44px rail on the right edge with `#` and A–Z (`LETTERS`, `services/apps/letters.ts`; a name files under its first letter with accents folded, anything else under `#`). Letters with no installed app are dimmed. The rail is pointer only (`aria-hidden`); keyboard and screen-reader users reach the letter list through `ui launcher` (Mod+K).

- **Hold and slide** (`touch-action: none`, pointer capture): a panel over a blurred scrim shows only the held letter's apps, its heading at a fixed line 30% down the stage (`pt-[30cqh]`); "No apps under X" for an empty letter. A primary bubble with the letter follows the finger beside the rail, each new letter vibrates. Sliding more than 32px left of the rail picks the app row under the finger (lit `primary/14`); letting go there launches it.
- **Let go on the rail:** opens browse with every other letter filled in above and below without moving the held one: the heading's position is measured before and after one `flushSync`, and the list scrolls by the difference. An empty letter anchors on the next letter with apps (else the previous). A short tap is the same thing, so it opens the full list at that letter.
- **Pointer cancel** (Android's edge back swipe takes the touch): the scrub ends and nothing opens. A browse list the scrub started from stays open; Back then closes it like any layer.
- **Browse** is `UiOverlay.LAUNCHER` (owner, 2026-10-25): shown exactly while `ui.overlay === "launcher"`, so Back, Home, Escape and an app taking focus close it through `ui` (ADR-028). Every way out inside it calls `ui.close()`: tapping the scrim or empty panel space, launching an app. All sections show, each heading lit (and its rail letter) as it passes the 30% line. A header in the panel's top padding (so it never shifts the held letter) holds "All apps · N installed", the **filter** field with an icon-only App Library button (`SquaresFour`) beside it (the way to apps not installed yet) and, offline, the shared `OfflineNote`.
- **Filter:** the old drawer's matching (owner, 2026-10-25 review): `search_apps()` (`services/apps/search.ts`: name, then id and keywords, then description and category, one typo forgiven in long words), so an app turns up by a keyword its name lacks. Matching installed apps keep their letter sections, empty sections hide; a "Not installed" section follows with a "Get" pill on each row (tap gets and opens; the menu offers "Get and open"), then **Related** from the sentence search (`SentenceSearch`, the ranker loaded on the first keystroke, no AI row). Nothing at all, once the ranker is in, says "No apps match". Enter opens the best match: the first installed result, else the first not installed, else the first related. Clearing the field restores every letter; closing the panel clears it.
- **Focus:** opened from a keyboard (the All apps row with Enter, Mod+K) the filter takes focus; opened by touch the panel does, so the phone's keyboard doesn't come up over the list. A release on the rail opens browse while the panel is already showing, so `release()` focuses the panel itself. Whatever had focus before is remembered before the home goes `inert` and gets it back on close, unless an app came on screen.
- Rows are `AppRow`s with the shared `app_menu` on long press: Add to home screen (disabled when pinned), Keep offline for user apps, Uninstall… for user apps; Get and open when not installed.

## Swipe down to dismiss

Every bottom sheet on the phone closes with a downward swipe (2026-10-22, owner: "not all drawers that popup have slide down?"). One attachment does it, `swipe_dismiss` (`$lib/core/utils/swipe-dismiss.ts`, math in `sheet-gesture.ts`), and a kit `Grabber` on top shows it; the pattern is [Bottom sheets](../../design/patterns.md#bottom-sheets).

- **Touch only.** A mouse never drags a sheet, so the desktop is unchanged. It listens to touch events, not pointer events: whether the sheet or the browser gets a drag depends on the scroller under the finger at the moment the drag starts, and only a cancelled `touchmove` can take a gesture from the browser.
- **Claiming.** The first move decides: mostly downward, and no element between the finger and the sheet scrolled down (`scrollTop > 0`), then the sheet owns the drag and every `touchmove` is cancelled; otherwise it's the page's for the rest of the touch. A drag on a range slider is never the sheet's. An element laid out in flow (`position: static`) isn't a sheet: a game's stats panel at a wide size is a side panel.
- **Moving.** `translate` follows the finger down; up, and down on a sheet that can't be dismissed and doesn't set `swipe_cancels`, it rubber-bands (approaches 56px, never reaches it).
- **Release.** Past 25% of the sheet's height, or a flick faster than 0.5 px/ms over the last 100ms, it slides off the bottom (200ms) and calls `on_dismiss`; a flick back up keeps it. Otherwise it springs back. Motion off (`motion_reduced()`) skips both animations, the swipe still closes.
- **Same path.** `on_dismiss` is the surface's own Cancel or Back: `entry.resolve(null)` for system dialogs and window sheets (so `dismissible: false` and the close guards hold), the app's own close for in-app sheets. A surface still showing after `on_dismiss` (a guard said no, or it only hid) comes back to rest; one playing a Svelte outro (`inert`) is left alone.

| Surface | Before | Now |
|---------|--------|-----|
| Context menus, Open with (system, anchored) | Back, scrim | + swipe, grabber |
| System questions: Properties, Rename, new-app announcements, Restore, home Delete, the introduction | Centred; Back, scrim, buttons | Docked to the bottom; dismissible ones + swipe and grabber; required ones (`dismissible: false`: Restore, Delete and other confirms, the introduction) only rubber-band |
| Window sheets: prompt, file and save pickers, app sheets (Warren's templates, Soundboard's clip and pad dialogs, Bulk Rename, Properties) | Centred in the window; Back, Esc, Cancel | Docked to the window's bottom (`animate-sheet-in`); + swipe, grabber |
| Window confirm (`window.confirm`), save changes, conflict | Centred; buttons only (ADR-025: a confirm needs an explicit answer) | Docked; rubber-band only, no grabber |
| In-app sheets: Warren's More, Ask's commands, Shopping List's item editor | Back, Esc, scrim, Done | + swipe, kit `Grabber` |
| Game stats and rules panels (17 games, below `@3xl` or `@5xl`) | The toolbar toggle | + swipe, grabber (hidden when it's a side panel) |

Not given the swipe, on purpose:

- **Notification center.** It's the switcher's top band, not a sheet; its cards already flick up to close apps and the list scrolls. Back, Home and the running-apps button close it.
- **The switcher.** Full screen, sideways scroll plus flick-up cards.
- **AI gate.** An in-app empty state, not a layer.
- **Kit popovers** (Waveform's help, Image Editor's Save as, `Select`'s picker): anchored popovers, not sheets, on every size; light dismiss.

## Services read

`windows` (as `MobileWindowsService`), `desktop` (as `MobileDesktopService`), `apps` (listings, recent, install state), `store` (dimming, `can_open`), `dialogs`, `notifications` (toasts, the nav bar's unread dot), `ui` (launcher, switcher and edit overlays, `back()`), `settings` (wallpaper).

## Known gaps

- Apps aren't adjusted for phone widths yet (second pass). Most assume a desktop-sized window.
- Two device backs with no tap between them leave WebOS: Chrome skips a history entry pushed without a gesture, so the guard re-arms only on the next tap ([ui](../services/ui.md#back)).
- No virtual keyboard handling beyond what `h-dvh` gives.
- Docked questions keep their desktop widths (a confirm is 24rem, capped to the screen), so they float as cards rather than spanning the width.
- Swipe to dismiss is checked with CDP touch in emulated Chromium, not yet on a phone.
- Hold-to-edit and the drag are checked with CDP touch in emulated Chromium and with a mouse; the rail scrub with a mouse only. Neither yet on a Samsung phone (edge back swipe, diagonal exits, whether its long press still cancels the touch).
- The rail has no keyboard or screen reader path of its own; the All apps row and its filter stand in.
- Widgets get the full width whatever their `size.w`; the phone resizes only the height, the width is set on the desktop.
