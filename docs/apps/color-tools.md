# Color Tools
Id `color-tools` · Source: `src/lib/apps/user/color-tools/` · [ADR-072](../adrs/072-color-tools.md) · [brainstorm](../brainstorm/2026-10-25_chromatics.md)

## What it does

One window, one current colour, six sections in a SideNav (sidebar from `@2xl`, a tab row below): **Pick** (the screen through EyeDropper, a picture or the camera with a loupe, typed CSS in any syntax, sliders in any of the 70 models), **Convert** (the colour in every model, copyable), **Contrast** (WCAG 2 ratio of text on a background, AA/AAA badges), **Vision** (protan, deutan, tritan at a chosen severity, for the colour or the open palette), **Harmony** (complement, triadic, tetradic, square, split complementary, analogous, a 9-step ramp, steps to a second colour) and **Palette** (named swatches in `.palette` files). Tapping any swatch makes it the current colour. All colour math comes from `@lilbunnyrabbit/chromatics`; the app has no formula of its own.

## How it works

Pure logic is in `color.ts`, `models.ts`, `contrast.ts`, `harmony.ts`, `vision.ts`, `sample.ts` and `palette.ts` (Node-tested in `color.test.ts` and `logic.test.ts`); file I/O is in `palette-store.ts` (browser-tested); the window is `color-tools.app.svelte` with a component per section.

### The wrappers other apps import

`color.ts` is the snake_case face of the package for other apps (the colour games swap culori for it next). It imports per-model subpaths (`/oklch`, `/srgb`, `/srgb8`, `/hsv`, `/lab65`), so an importer bundles only the models those reach.

| Function | Package call |
|----------|--------------|
| `oklch(l, c, h, alpha?)`, `hsv(…)`, `lab65(…)`, `rgb8(…)` | `new Oklch(…)` etc.; units are the package's (fractions, OKLCH `l` 0–1, Lab `l` 0–100, `rgb8` alpha 0–255) |
| `to_oklch`, `to_hsv`, `to_lab65` | `.to(Model)`, returned as plain objects so Svelte state never holds a mutable class instance |
| `from_hex(hex)` | `Srgb8.parse`, `null` on failure |
| `to_display_srgb`, `to_hex` | `.to(Srgb).gamutMap()` (CSS Color 4 MINDE), then `.to(Srgb8).toHex()`; `#rrggbbaa` when translucent |
| `in_srgb_gamut` | `.to(Srgb).inGamut()` |
| `delta_e2000(a, b)` | `Lab65.deltaE2000`, the white point culori's `differenceCiede2000` uses |
| `contrast_ratio(fg, bg)` | both gamut-mapped, background made opaque, `fg.over(bg)` then `contrast(bg)` |

A string input to these is a hex or a CSS colour name. Any other syntax goes through `models.ts`, which imports `/all` (`parse`, `models`) and so bundles all 70 models: `parse_css`, `convert` (`null` on the package's `RangeError`, e.g. part of sRGB has no `Ryb`), `channels_of` (from each model's `channels` metadata), `with_channel` / `with_alpha` (a new instance from the constructor, channels in constructor order), `route(from, to)` (the package's `path`, the models a conversion passes through; Colour Atlas shows it) and `format_color` (the model's `toString()` with every number rounded to 4 decimals; only digits change, so it still parses).

### The current colour

Kept per window in `storage.window("state")` (`state.ts`, each field with its own zod `.catch`) as the string of the model it was last set in: an EyeDropper pick is `#rrggbb`, a typed `hsv(…)` stays HSV, a slider move stores that slider model's string. Every section derives a fresh instance with `parse_css`, so nothing mutates a shared object, and a slider edit in HSV doesn't drift through another model. Out-of-sRGB colours show a "shown mapped" badge; everything on screen uses `to_hex`.

### Pick

- **Screen:** `new EyeDropper().open()` where it exists (Chromium desktop). Esc's `AbortError` is ignored.
- **Picture:** Open… (WebOS file), From device…, drop or paste (only when the window is focused and no sheet is open). The image is decoded with `load_image` and, past 2048 px on the long side, drawn smaller through an `OffscreenCanvas` (`fit_size`); its pixels are read once.
- **Camera:** `getUserMedia({ facingMode: "environment" })` in `camera.svelte.ts`, released while the window is hidden or the section isn't shown. Tapping the viewfinder freezes that frame into the picture and picks the tapped pixel; Freeze frame does it without a pick.
- **Sampler** (`sampler.svelte`): the picture on a canvas at its natural size, scaled by CSS. Pointer down captures, the pick lands on `lostpointercapture`. While aiming a loupe shows 11×11 pixels at 8× with the centre pixel outlined and its hex; on touch it always sits above the finger. Keyboard: arrows move one pixel (Shift ten), Enter or Space picks.
- **Sliders:** a model `Select` (all 70 ids) and a kit `Slider` per channel over the channel's reference range (step: a thousandth of it, 1 for the byte model, whose alpha is 0–255), plus alpha. Under each, a strip of the colours that channel gives with the others held. A colour outside the chosen model's number range says so instead.

### Contrast, Vision, Harmony

- Contrast shows the ratio floored to two decimals (WCAG compares unrounded, so 4.499 must not read 4.50) and four badges: AA 4.5, AAA 7, AA large 3, AAA large 4.5 (`contrast.ts`). The background is its own window field; Swap exchanges the two.
- Vision runs `simulateCvd` (`/cvd`, Machado 2009) on the gamut-mapped sRGB, severity 0–1 in 5% steps; 1 is named "-opia", less "-omaly".
- Harmony converts to OKLCH, Okhsl or HSL and calls the package's `complement`, `triadic`, `tetradic`, `square`, `splitComplementary`, `analogous`, `ramp(9)` and `steps` (3–12, both ends included). Each scheme has Add to palette while a palette is open; added colours are named after the scheme ("triadic 2").

## Data

- **Window state:** section, current colour, slider model, contrast background, severity and source, hue space, steps end and count, the open palette's path. Saved with the session.
- **`.palette`**, in `/home/Documents` by default (any folder works through Open…), associated with Color Tools so it opens from File Explorer and Open with:

  ```json
  { "version": 1, "name": "Sea", "colors": [{ "name": "deep", "css": "oklch(0.4 0.1 220)" }] }
  ```

  `name` up to 80 characters, at most 256 colours, `css` any string `parse()` reads (up to 200 characters). Added colours are stored as `format_color(color, 5)` in their own model. The open file is a `json_file` (ADR-035 cell): edits save as you go, other windows on the same file follow. A file that fails the schema (another version, bad JSON, one unreadable colour) is shown as unreadable and left untouched. From device… copies the file into Documents under a free name.
- **Props:** `path` (`FILE_PROPS`), from the association: the window opens on Palette with that file.
- **Guide** (`guide.md`, ADR-085): the current colour, each Pick source with its pointer and keyboard controls, the other sections in a line each, and palettes (create, add, rename, remove, open). The window's `?` button or F1 shows it; it opens by itself the first time Color Tools is launched with no props, so opening a `.palette` skips it. Keep it in step with the sections above.

## Dependencies & licences

`@lilbunnyrabbit/chromatics` `^0.1.0` (MIT, the owner's package, one dependency `@lilbunnyrabbit/optional`), in this app's `package.json` (ADR-045). Imported only from lazy code; the manifest imports none of it.

## Limits

- No reordering of palette colours, no undo.
- Contrast is WCAG 2 only; APCA, "fix toward AA" and palette-from-image wait for the package (brainstorm, "Missing math").
- The sampler reads the picture as the canvas decodes it (sRGB); a wide-gamut photo's out-of-sRGB colours are clipped by the browser before sampling.
- The app chunk is 163.5 KB, 50 KB gzipped (production build, 2026-10-25), most of it the 70 models `/all` brings; the manifest adds nothing from the package to boot.

## Decisions

- [ADR-072](../adrs/072-color-tools.md) and its 2026-10-25 revision (what the build chose).
- [Chromatics in WebOS brainstorm](../brainstorm/2026-10-25_chromatics.md): package only, no copied studio code, Mix later, shell nothing for now.
