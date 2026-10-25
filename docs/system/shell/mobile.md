# Mobile shell

Source: `src/lib/core/components/mobile/` · ADR: [ADR-016](../../adrs/016-mobile-support.md) (revisions 2026-10-12, 2026-10-25) · Brainstorms: [shell](../../brainstorm/2026-10-12_mobile-shell.md), [list home](../../brainstorm/2026-10-25_niagara-home.md)

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
- **Recent:** up to four `AppRow`s (`components/apps/app-row.svelte`: a 44px tile with the app's icon and badge, the name in `text-xl`; dimmed when not saved for offline) from `apps.recent`, skipping apps pinned on home and apps not installed. Hidden when empty and in edit mode. Long press: the shared `app_menu` with Clear recent.
- **Pinned:** `desktop.home()`, bottom-aligned (`mt-auto`) so a short home sits near the thumb. Shortcuts, files and folders are text rows: a 28px `ShortcutIcon` with its badge or a bare `FileIcon` (folders `primary` fill), the name in `text-2xl`, " · missing" in `error` for a shortcut to an unknown app. Tap opens through `desktop.open`.
- **Widgets** (2026-10-19): a full-width rounded frame `size.h × 104px` tall in the widget's style (`widget_surface`, shared with the desktop: card, glass or clear, ADR-034 revision 2026-10-21), the app's widget component inside (`components/desktop/widget-body.svelte`). No title strip: holding the frame (outside inputs) opens the item menu. The width is the list's, so `size.w` only matters on the desktop.
- **All apps:** a quiet row at the end (`SquaresFour`, `foreground/65`) that opens App Library, the way to apps not installed yet. The letter list stays on the rail and `ui launcher` (Mod+K). Hidden in edit mode.
- **Empty:** "Nothing pinned yet", with a line on finding apps on the letters and holding the background for a widget.
- The list scrolls under a 1rem top fade (`mask-image`), leaves room on the right for the rail, and goes `inert` (with the clock) while the letter panel is up.
- **Long press** (`$lib/core/utils/long-press.ts`): 450ms without moving more than 16px (a still finger on Samsung Internet drifts past 8px). Moving earlier hands the gesture to the browser (scroll). Once it fires: a short vibration, pointer capture, `touchmove` cancelled so the list doesn't scroll under the finger, and the click after release swallowed. Android's own long-press `contextmenu` is suppressed but used as a backstop: Samsung Internet's long press (on elements with text) beats the 450ms timer, so a touch `contextmenu` while the timer is pending holds at once, and one arriving after the browser already sent `pointercancel` opens the menu right there (`pressed` survives the cancel; a release or a move past the slop clears it). A mouse right-click opens the menu. `-webkit-touch-callout: none` and `select-none` keep iOS from adding its callout.
  - **Item menu** (`home-actions.ts`): Open, Edit home screen, Style › Card / Glass / Clear (widgets only, current one checked; the sheet opens it inline), Rename, Delete / Remove shortcut / Remove widget, Uninstall… (shortcuts and widgets of user apps), Properties. Rename, delete and properties are `desktop-actions.ts`'s flows.
  - **Empty space menu:** Edit home screen and Add widget, then the desktop's background menu (`background_menu(point, lead)`: New folder, Paste, Change wallpaper or theme). Sort by isn't offered: the home is an ordered list.
- **Edit mode** (2026-10-19, [brainstorm](../../brainstorm/2026-10-19_mobile-home-widgets.md)): the `home-edit` overlay in [ui](../services/ui.md), so Back, the device's back gesture and Escape leave it like any layer; opening the list or switcher, or an app coming on screen, ends it too. A top row shows Add widget and Done; Recent, All apps and the rail hide; taps on rows and widgets do nothing. Each entry gets a 44px grip on its right with `touch-action: none`, so a press is ours from pointer-down and the browser never claims it as a scroll (why the hold-then-drag of 2026-10-13 failed on Samsung Internet and this doesn't). Dragging a grip past 8px dims the entry and shows a primary bar where it will land (the upper or lower half of the row under the finger); release moves it through `move_item(name, before)`. Leaving mid-drag drops it. Add widget: a menu of installed apps with a widget; the pick is pinned at its default size and lands at the end.

### Letter rail and full app list

`letter-index.svelte`: a 44px rail on the right edge with `#` and A–Z (`LETTERS`, `services/apps/letters.ts`; a name files under its first letter with accents folded, anything else under `#`). Letters with no installed app are dimmed. The rail is pointer only (`aria-hidden`); keyboard and screen-reader users reach the letter list through `ui launcher` (Mod+K).

- **Hold and slide** (`touch-action: none`, pointer capture): a panel over a blurred scrim shows only the held letter's apps, its heading at a fixed line 30% down the stage (`pt-[30cqh]`); "No apps under X" for an empty letter. A primary bubble with the letter follows the finger beside the rail, each new letter vibrates. Sliding more than 32px left of the rail picks the app row under the finger (lit `primary/14`); letting go there launches it.
- **Let go on the rail:** opens browse with every other letter filled in above and below without moving the held one: the heading's position is measured before and after one `flushSync`, and the list scrolls by the difference. An empty letter anchors on the next letter with apps (else the previous). A short tap is the same thing, so it opens the full list at that letter.
- **Pointer cancel** (Android's edge back swipe takes the touch): nothing opens.
- **Browse** is `UiOverlay.LAUNCHER` (owner, 2026-10-25): shown exactly while `ui.overlay === "launcher"`, so Back, Home, Escape and an app taking focus close it through `ui` (ADR-028). Every way out inside it calls `ui.close()`: tapping the scrim or empty panel space, launching an app. All sections show, each heading lit (and its rail letter) as it passes the 30% line. A header in the panel's top padding (so it never shifts the held letter) holds "All apps · N installed", the **filter** field with an icon-only App Library button (`SquaresFour`) beside it (the way to apps not installed yet) and, offline, the shared `OfflineNote`.
- **Filter:** `search_app_names()` (`services/apps/search.ts`): the shared ranking on the name alone, one typo forgiven in long words. Matching installed apps keep their letter sections, empty sections hide; a "Not installed" section follows with a "Get" pill on each row (tap gets and opens; the menu offers "Get and open"); nothing at all says "No apps match". Enter opens the best match. Clearing the field restores every letter; closing the panel clears it.
- **Focus:** opened from a keyboard (the All apps row with Enter, Mod+K) the filter takes focus; opened by touch the panel does, so the phone's keyboard doesn't come up over the list. Whatever had focus before is remembered before the home goes `inert` and gets it back on close, unless an app came on screen.
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

`windows` (as `MobileWindowsService`), `desktop` (as `MobileDesktopService`), `apps` (listings, recent, install state), `offline` (dimming, `can_open`), `dialogs`, `notifications` (toasts, the nav bar's unread dot), `ui` (launcher, switcher and edit overlays, `back()`), `settings` (wallpaper).

## Known gaps

- Apps aren't adjusted for phone widths yet (second pass). Most assume a desktop-sized window.
- Two device backs with no tap between them leave WebOS: Chrome skips a history entry pushed without a gesture, so the guard re-arms only on the next tap ([ui](../services/ui.md#back)).
- No virtual keyboard handling beyond what `h-dvh` gives.
- Docked questions keep their desktop widths (a confirm is 24rem, capped to the screen), so they float as cards rather than spanning the width.
- Swipe to dismiss is checked with CDP touch in emulated Chromium, not yet on a phone.
- Edit mode drag and the rail scrub are checked with a mouse in Chromium only; not yet on a Samsung phone (edge back swipe, diagonal exits).
- The rail has no keyboard or screen reader path of its own; the All apps row and its filter stand in.
- Widgets get the full width whatever their `size.w`, and there's no resize on the phone; a widget's size is set on the desktop.
- No sentence-search "Related" results in the phone's list (the old drawer had them); the filter matches names only. App Library opens from the home's All apps row.
