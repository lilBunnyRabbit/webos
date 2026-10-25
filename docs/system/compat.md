# Browser support check

ADR: [ADR-067](../adrs/067-browser-support-check.md) ([brainstorm](../brainstorm/2026-10-23_browser-support.md)) · Source: `src/boot.ts`, `src/lib/core/compat/` · Ways in: the warning screen at start-up, Settings › About › Browser support, the shell's `compat` command

## Purpose

WebOS targets the owner's current Chrome and uses features other engines lack or ship late. Before any of WebOS loads, a tiny entry checks the browser for every one of them and, when something is missing or the engine is older than where the feature works the way WebOS uses it, shows a plain-DOM warning screen listing what won't work and what to update to. An engine that can't parse or run the main bundle still gets told why.

## Files

| File | Holds |
|------|-------|
| `src/boot.ts` | The page's entry (`index.html` loads it instead of `main.ts`). Detects the browser, runs every probe, scopes to a solo app, then `import("./main")` or lazily loads the screen |
| `core/compat/features.ts` | **The list**: every non-baseline web feature WebOS uses (`FEATURES`), `Level`, `LEVELS`, `LEVEL_LABELS`. Imports nothing |
| `core/compat/browser.ts` | `parse_user_agent(ua, brands)` → `Browser` (`name`, `version`, `os`, `engine`, `engine_version`), `detect_browser()`, `browser_label()`, `compare_versions()`, `MIN_KEY` |
| `core/compat/check.ts` | `status()`, `check()`, `solo_app(hash)`, `in_scope()`, `problems()`, `should_show()`, `next_dismissed()`, `parse_dismissed()`, `requirement()`, `fixed_by_update()`, `min_text()`, `DISMISSED_KEY`, `SOLO_HASH` |
| `core/compat/storage.ts` | `read_dismissed()` / `write_dismissed()`, localStorage wrapped in try/catch |
| `core/compat/app-names.ts` | `APP_NAMES` (display names of every app the list names) and `app_name(id)` |
| `core/compat/screen.ts` | `show_compat_screen(options)`: the warning in plain DOM, lazy |
| `core/compat/report.ts` | `compat_now()` (full, unscoped results for this browser) and `compat_rows()` for Settings and the shell |

Pure parts have Node tests (`browser.test.ts`: real UA strings for Chrome on macOS, Windows and Android, Edge, Opera, Samsung Internet, Brave by client hints, Firefox desktop and Android, Safari macOS and iOS, iOS Chrome and Firefox, unknown; `check.test.ts`: status, scoping, dismissal, requirement text; `features.test.ts`: unique ids, levels, versions, every app id exists and `APP_NAMES` matches each manifest's `name`). `compat.browser.test.ts` runs every probe in Chromium (each answers a boolean without throwing; every `start` and `shell` probe passes except the flag-dependent `ai-writing`, `pop-out` and `notification-actions`) and drives the screen.

## An entry

```ts
{
  id: "anchor-positioning",
  name: "Anchor positioning",
  lost: "Menus, dialogs, the start menu and tooltips open in the wrong place.",
  level: Level.SHELL,
  apps: ["terminal", "paint", …],
  min: min("129", "147", "26"),            // chrome, firefox, safari; null = not shipped
  probe: () => css("anchor-name: --a") && css("position-area: top") && css("position-try-fallbacks: flip-block"),
}
```

- **`level`**: `start` (WebOS can't boot), `shell` (the desktop, its menus or an OS feature breaks), `apps` (apps lose something), `cosmetic` (looks or feels a little worse).
- **`apps`**: ids of apps that use the feature directly. Required on `apps` entries; allowed on any level, which is what a solo link scopes by.
- **`min`**: the version where the feature works **the way WebOS uses it**, from MDN browser-compat-data (8.1.7), not where it first appeared. Popover is Safari 18.3 because iOS before 18.3 has the attribute only in part; anchor positioning is Chrome 129 because 125 to 128 called `position-area` `inset-area`; relative colours are Chrome 138 because derived themes also use `abs()`. The reasoning sits as a comment beside each non-obvious entry. `safari` covers iOS too: every iOS browser runs WebKit at the iOS version.
- **`probe()`**: synchronous and cheap: an `in` check, `CSS.supports`, or a tiny canvas draw where a feature exists but does nothing (Safari has `ctx.filter` and ignores it, so `canvas-filter` inverts one pixel and reads it back). A throwing probe counts as missing.

## Status

`status(feature, browser)`:

- **missing**: the probe fails.
- **outdated** ("may misbehave"): the probe passes, but a recognised engine's version is below `min`, or `min` is `null` for it (a flag or preview build).
- **ok**: otherwise, and always when the engine or its version is unknown: an unrecognised browser is judged by probes alone.

## Detection

`parse_user_agent` maps the UA to an engine and the version `min` is compared against:

| UA | Name | Engine | Engine version |
|----|------|--------|----------------|
| `Chrome/141` (or `HeadlessChrome`, `Chromium`) | Chrome, or Brave when the client hint brands say so | chromium | 141 |
| `… Edg/141`, `OPR/124`, `SamsungBrowser/28.0`, `YaBrowser`, `Vivaldi` | Edge, Opera, Samsung Internet, Yandex, Vivaldi (own version shown) | chromium | the `Chrome/` major |
| `Gecko/… Firefox/144` | Firefox | gecko | 144 |
| `Version/18.4 Safari/…` (macOS) | Safari | webkit | 18.4 |
| `iPhone OS 18_4 … Version/18.4` | Safari | webkit | `Version/` |
| `iPhone OS 17_5 … CriOS/141` (`FxiOS`, `EdgiOS`, `OPT`) | Chrome, Firefox, Edge, Opera | webkit | the iOS version; `null` when it reads 18.6, the value iOS 26 froze every iOS UA at |
| anything else | `null` ("Unknown browser") | `null` | `null` |

`browser_label()` gives "Safari 18.4 · iOS", "Edge 141 · Windows". `requirement()` turns `min` into the line under each row: "Update to Chrome 129 or later" (Chrome, Edge, Brave), "Needs Chromium 129 or later" (other Chromium browsers, whose own versions differ), "Update to Firefox 147 or later", "Update to Safari 26 or later", "Update to iOS 26 or later" (every iOS browser), "Not available in Safari yet" / "Not available on iOS yet" when `min` is `null`, and for an unknown browser "Works in Chrome 129, Firefox 147, Safari 26". A feature missing from a version already at or past `min` is one the browser leaves out on this OS (BarcodeDetector in Chrome on Windows and Linux, the AI and pop-out APIs in Chrome on Android): `fixed_by_update()` is false and the line reads "Not available in Chrome on Windows" ("Not available on iOS" for iOS). A flag-dependent feature turned off reads the same; accepted (owner, 2026-10-24). The screen's lead ends with "Updating the browser fixes them." / "fixes N of them." only for the problems `fixed_by_update()` counts, and with nothing when none are.

## Boot

1. `index.html` loads `src/boot.ts` (the `index-*.js` entry). In a production build it also `modulepreload`s `main.ts`'s chunk and its static imports (`core`, `app-boot`, `preload-helper`) and `preload`s its stylesheet, so those download alongside the entry (`preload_main_plugin` in `vite.config.ts`). The stylesheet is only preloaded: applied, it would restyle the warning screen; Vite's preload helper links it when `main.ts` loads.
2. `boot.ts` runs `check(FEATURES, detect_browser())`, keeps the entries `in_scope` for `solo_app(location.hash)`, and reads `webos.compat.dismissed`.
3. Nothing missing or outdated beyond the dismissed set: `import("./main")`, and boot carries on as in [overview](overview.md#boot-sequence).
4. Otherwise it imports `screen.ts` and shows the warning over the splash. Continue (or Try anyway, or Escape) removes the screen and imports `main.ts`; the splash and its progress bar are still underneath.
5. If importing `main.ts` throws (a parse error, no import map support), `boot.ts` logs it and shows the screen again with "WebOS couldn't load: <message>" at the top. Errors inside `main()` (a service `init()` throwing) still end at `main.ts`'s own boot error on the splash.

`boot.ts` and the list must parse in old engines: no syntax newer than the build target (`baseline-widely-available`: Chrome 107, Firefox 104, Safari 16), and nothing imported from `core`. `SOLO_HASH` duplicates `SOLO_PREFIX` from `kernel/mode.ts` for that reason, and a test keeps them equal. Vite's preload helper sits in its own `preload-helper` chunk for the same reason: in `core`, the entry would import all of core before checking anything.

## Solo scope

`solo_app("#/solo/paint?x=1")` is `"paint"`. In solo, `in_scope` keeps `start` entries and the entries whose `apps` include the id; shell, cosmetic and other apps' entries are ignored. The screen's label names the app ("Paint · Safari 17.5 · iOS"; `app_name` falls back to the id in words for an app the list doesn't name, so a solo Portfolio reads "Portfolio · …"). An app with no entries sees the screen only for a start blocker. Settings › About and `compat` are never scoped.

## Dismissal

`localStorage["webos.compat.dismissed"]` is a JSON array of sorted feature ids. The screen shows only when some missing or outdated in-scope entry is outside the set (`should_show`). Don't show again writes `next_dismissed()`: in full WebOS, the ids wrong now (replacing the set); in solo, the set plus the ids wrong now, so dismissing in a solo link never hides what full WebOS would show. Storage that throws reads as empty, and a failed write is dropped: the screen then shows every time. localStorage rather than OPFS because OPFS may be the missing part.

## Screen

Plain DOM (`#compat-screen`, fixed, top of the stacking order, scrolls on its own), no Svelte and no shell: those may be the broken parts. Styles are one inline `<style>` with Brand Dark's tokens as hex (`background` `#17252c`, `background_light` `#1d2e36`, `background_lightest` `#2a404a`, `foreground` `#b1aba8`, `primary` `#a4b483`, `cottontail` `#e3f9b2` for focus, `warning`, `error`), since Firefox before 113 drops `oklch()`. Inter with the system font behind it, as on the splash.

- Header: the logo, a title ("WebOS probably won't start in this browser" when a `start` entry is missing, "Some things won't work in this browser" otherwise, "Everything WebOS uses works here" when shown from Settings with nothing wrong), the browser label (prefixed with the app in solo), and a count of missing and "may misbehave" entries.
- Groups in order: Won't start, Shell, Apps, Cosmetic, each with its count. A row has the name, a Missing (error) or May misbehave (warning) badge, what's lost, "Apps: …" with display names when the entry names apps, and the `requirement()` line.
- A sticky footer with Don't show again (a 44 px tall label around a checkbox) and the primary button, "Continue anyway", or "Try anyway" when a `start` entry is missing. The button takes focus; Escape continues. At phone widths the button fills the row.

## Settings › About

`sections/browser-support.svelte`, the `browser-support` setting (search: "Browser support", "compatibility", "safari", "firefox"). A row with the browser label and a summary ("All 61 features supported." or "59 of 61 supported, 1 missing, 1 may misbehave."), a Show the warning button, then every entry grouped by level with a Supported, Missing or May misbehave badge, what's lost, its apps and, when not ok, the `requirement()` line. Show the warning clears the dismissal and draws the screen over the running OS with the full list; Continue or Escape closes it. No reload.

## Shell

`compat` (a core shell command, [shell](services/shell.md#core-commands)) yields a `compat` value per entry: `id`, `feature`, `level`, `status`, `apps` (display names), `min` ("Chrome 129, Firefox 147, Safari 26"). Columns: feature, level, status, apps, min. `compat | where status != ok` lists what this browser lacks. It imports `report.ts` on first run, so the list stays out of `core`.

## Keeping the list current

CLAUDE.md's "Browser support list" rule: a commit that starts using a web API, CSS or HTML feature that isn't broadly supported adds or updates its entry (level, apps, `min` from MDN, a probe); removing the last use removes the entry. The test that every named app exists and the Chromium probe test are the only automatic guards.

## Divergence from ADR

- `apps` is allowed on every level, not only `apps` entries, so solo scoping catches the Popover and anchor positioning use inside an app (ADR revision 2026-10-23).
- Display names live in `app-names.ts` beside the list, kept equal to the manifests by a test.

## Known gaps

- No real Safari, iOS or Firefox run yet; everything was checked in Chromium with UA overrides and deleted prototype members.
- `min` versions are copied from MDN data and age; probes stay the truth.
- Since 3.60.1 the calls the inventory found unguarded have fallbacks; their entries say what is still lost (idle callbacks, canvas filters and coalesced events are cosmetic now, caret from point accepts `caretRangeFromPoint`).
- The list's text is about half of the 7 KB gz entry, and the boot budget has under 1 KB left.

## The list

Generated from `FEATURES` on 2026-10-23. The code is the source of truth.

### Won't start (`start`)

| id | Feature | Lost without it | Apps | Chrome | Firefox | Safari |
|----|---------|-----------------|------|--------|---------|--------|
| `opfs` | Private file storage | WebOS keeps every file and setting here. |  | 86 | 111 | 15.2 |
| `opfs-write` | Writing files | Nothing can be saved, and the first start writes a file. | `api-client` `p2p-transfer` | 86 | 111 | 26 |
| `web-locks` | Web Locks | Alarms and offline apps coordinate open tabs with it at start-up. | `moonrabbit` | 69 | 96 | 15.4 |
| `broadcast-channel` | Broadcast Channel | Alarms talk between tabs with it at start-up. |  | 54 | 38 | 15.4 |
| `import-maps` | Import maps | WebOS's code can't load. |  | 105 | 108 | 16.4 |

### Shell (`shell`)

| id | Feature | Lost without it | Apps | Chrome | Firefox | Safari |
|----|---------|-----------------|------|--------|---------|--------|
| `modern-css` | Modern CSS | The interface loses colours, spacing and shadows. |  | 111 | 128 | 16.4 |
| `popover` | Popover | The start menu, notification centre, terminal suggestions and app menus don't open or close properly. | `terminal` `font-maker` `hopsprite` `image-editor` `kanban` `lunar-lander` `markdown-pdf` `moonrabbit` `paint` `quick-notes` `soundboard` `warren` `web-app` `portfolio` | 114 | 125 | 18.3 |
| `anchor-positioning` | Anchor positioning | Menus, dialogs, the start menu and tooltips open in the wrong place. | `terminal` `font-maker` `hopsprite` `image-editor` `lunar-lander` `paint` `soundboard` `warren` `portfolio` | 129 | 147 | 26 |
| `dialog-closedby` | Dialog light dismiss | Menus and dialogs don't close when you click outside them. |  | 134 | 141 | no |
| `relative-colors` | Relative colours | Themes other than Brand Dark and Brand Light get wrong surface and state colours. | `settings` | 138 | 128 | 18 |
| `light-dark` | light-dark() | Some controls get the wrong colours. |  | 123 | 120 | 17.5 |
| `css-nesting` | CSS nesting | Parts of the taskbar and start menu lose their styles. |  | 120 | 117 | 17.2 |
| `container-queries` | Container queries | Windows and apps don't fit their layout to their size. |  | 105 | 110 | 16 |
| `has-selector` | :has() | An auto-hidden taskbar doesn't come back; some toggles don't show their state. |  | 105 | 121 | 15.4 |
| `inert` | inert | Hidden windows and sheets can still take focus and taps. |  | 102 | 112 | 15.5 |
| `dynamic-viewport` | Dynamic viewport units | On phones the desktop and menus can sit under the browser's toolbars. |  | 108 | 101 | 15.4 |
| `mask-image` | CSS masks | App icons draw as solid squares. |  | 120 | 53 | 15.4 |
| `deflate-raw` | Zip compression | Zip files and backups can't be made or opened. | `archive` `cards` `forms` `p2p-transfer` | 103 | 113 | 16.4 |
| `user-activation` | User activation | Backups and alarm sounds fail with an error. |  | 72 | 120 | 16.4 |
| `check-visibility` | checkVisibility() | Settings' side list doesn't follow your scrolling. | `settings` `funky` | 105 | 106 | 17.4 |
| `subgrid` | Subgrid | File list columns don't line up. |  | 117 | 71 | 16 |
| `window-zoom` | CSS zoom | Zooming a window doesn't scale its content. |  | 1 | 126 | 3.1 |
| `file-pickers` | File System Access pickers | Mounting a folder from your device and saving a folder to disk. Files go to your downloads instead. |  | 86 | no | no |
| `pop-out` | Document Picture-in-Picture | Popping a window out to stay on top of other programs. |  | 116 | 151 | no |
| `notification-actions` | Notification buttons | Alarm and reminder notifications come without their buttons. | `clock` `pomodoro` `calendar` | 53 | 152 | no |
| `ai-writing` | On-device AI: summarize and translate | The summarize, translate and language commands. |  | 138 | no | no |

### Apps (`apps`)

| id | Feature | Lost without it | Apps | Chrome | Firefox | Safari |
|----|---------|-----------------|------|--------|---------|--------|
| `ai-prompt` | On-device AI: prompts | AI games and tools don't run; other apps hide their AI parts. | `alibi` `ask` `unsaid` `doodlehop` `warren` `shopping-list` | 148 | no | no |
| `video-frame-callback` | Video frame callbacks | Video tracking, frame stepping and camera scanning. | `birdseye` `video-tools` `soundboard` `gif-player` `cards` `p2p-transfer` `qr-reader` | 83 | 132 | 15.4 |
| `video-encoder` | Video encoding | Saving video. | `birdseye` `video-tools` | 94 | 130 | 16.4 |
| `audio-encoder` | Audio encoding | Sound in saved video and audio-only export. | `birdseye` `video-tools` | 94 | 130 | 26 |
| `image-decoder` | Image decoding | Playing GIFs; Hopsprite imports only a GIF's first frame. | `gif-player` `hopsprite` `image-tools` | 94 | 133 | no |
| `capture-stream` | Media capture streams | Taking a sound from a video file. | `soundboard` | 62 | 149 | no |
| `caret-from-point` | Caret from point | Picking a kerning pair and dropping a picture where you point. | `font-maker` `moonrabbit` `proposals` | 4 | 20 | 5 |
| `plaintext-only` | Plain-text editing | Journal entries and proposal sections can't be edited. | `moonrabbit` `proposals` | 51 | 136 | 5 |
| `custom-highlight` | Custom highlights | Find highlights in Warren and the kerning highlight in Font Maker. | `warren` `font-maker` | 105 | 149 | 17.2 |
| `web-share` | Web Share | Share buttons. | `cards` `p2p-transfer` `proposals` | 128 | no | 12.1 |
| `clipboard-image` | Copying images | Copying an image to the clipboard. | `image-tools` `qr-studio` | 76 | 127 | 13.1 |
| `barcode-detector` | Barcode detection | Cards reads EAN, UPC, Code 128 and Code 39 itself; other barcode types need typing. QR codes still work. | `cards` | 88 | no | no |
| `passkey-prf` | Passkey encryption (PRF) | Unlocking Moonrabbit with a passkey. PIN, pattern and phrase still work. | `moonrabbit` | 133 | 139 | 18 |
| `webhid` | WebHID | The HID device inspector. | `hid-lab` | 89 | no | no |
| `eyedropper` | EyeDropper | Picking a colour from the screen. | `paint` | 95 | no | no |

### Cosmetic (`cosmetic`)

| id | Feature | Lost without it | Apps | Chrome | Firefox | Safari |
|----|---------|-----------------|------|--------|---------|--------|
| `idle-callback` | Idle callbacks | Background work at start-up runs on a timer instead of when the browser is idle. | `text-editor` | 47 | 55 | no |
| `canvas-filter` | Canvas filters | Image Editor, Image Tools and Birdseye apply filters by hand: slower, and Birdseye's blur is softer. | `image-editor` `image-tools` `birdseye` | 52 | 49 | no |
| `coalesced-events` | Coalesced pointer events | Fast strokes in drawing apps are less smooth. | `paint` `doodlehop` `font-maker` `hopsprite` `proposals` `pdf-tools` | 58 | 59 | 18.2 |
| `wake-lock` | Screen Wake Lock | The screen may sleep while you cook, check out or transfer. | `recipe-box` `cards` `shopping-list` `p2p-transfer` | 84 | 126 | 18.4 |
| `webp-encode` | WebP encoding | Pictures are saved as larger PNG files. | `cards` `font-maker` `moonrabbit` `proposals` `warren` | 17 | 96 | no |
| `image-smoothing-quality` | Image smoothing quality | Shrunk images look rougher. | `image-editor` `image-tools` `birdseye` `video-tools` `icon-pack` `nonogram` | 54 | no | 9.1 |
| `field-sizing` | Auto-growing text boxes | Text boxes don't grow as you type. | `alibi` `ask` `kanban` `moonrabbit` | 123 | 152 | 26.2 |
| `corner-shape` | Corner shapes | The squircle icon preview shows a circle. | `icon-pack` | 139 | no | no |
| `keyboard-map` | Keyboard map | Key labels for your keyboard layout. | `hid-lab` | 69 | no | no |
| `scrollbar-gutter` | Scrollbar gutter | Week columns don't line up with their headers. | `calendar` | 94 | 97 | 18.2 |
| `fullscreen` | Fullscreen | Fullscreen visuals. iPhones have none. | `music-visualizer` | 71 | 64 | 16.4 |
| `vibration` | Vibration | Haptic feedback on long-press and in a few apps. | `hopsprite` `image-tools` `nurikabe` `shopping-list` | 32 | no | no |
| `view-transitions` | View transitions | Window and list animations. | `shopping-list` | 111 | 144 | 18 |
| `base-select` | Customizable select | Dropdowns use the browser's plain look. |  | 135 | no | 27 |
| `scroll-timeline` | Scroll-driven animations | Terminal tables don't fade at their scroll edge. | `terminal` | 115 | 159 | 26 |
| `text-wrap` | Balanced text wrapping | Headings wrap less evenly. |  | 114 | 121 | 17.5 |
| `scrollbar-styling` | Scrollbar styling | Scrollbars keep the browser's look. |  | 121 | 64 | 26.2 |
| `content-visibility` | content-visibility | Long lists and hidden windows render slower. | `csv-viewer` `gw2` | 85 | 125 | 18 |
| `backdrop-filter` | Backdrop blur | No frosted-glass blur behind dialogs, docks and widgets. |  | 76 | 103 | 18 |
| `badging` | App badge | The missed-alarm count on the installed app's icon. |  | 81 | no | 17 |
