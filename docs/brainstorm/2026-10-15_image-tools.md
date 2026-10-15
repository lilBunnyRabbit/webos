# Image Tools

**Date:** 2026-10-15
**Participants:** owner, Claude

## Context

The owner wants one Image Tools app, like PDF Tools, instead of single-purpose image apps. PDF Tools is one app with sections (`Section` const, `section` prop, `initial_section(props)` picks from the files passed in) and `pdf tools [section] [path]`. Image apps today: Background Remove, Image Concat, Image Crop (trims transparent borders), Image Split, Sprite Extractor, Image Editor, Paint, GIF Player. Nothing in core aliases an old app id.

## Decisions

| Topic | Decision | Rejected |
|---|---|---|
| Scope | Image Tools with sections Remove background, Join, Trim, Split, Sprites. Background Remove, Image Concat, Image Crop, Image Split and Sprite Extractor are deleted. Image Editor, Paint and GIF Player stay: editors and players, not one-shot tools | Four small tools only; folding in Image Editor too |
| Old ids | Let them go missing: old shortcuts show "missing", restore skips those windows, old deep links get the unknown-app toast. No manifest field, no migration | Manifest `replaces` field resolved by AppsService; a one-time boot migration in core naming user apps (breaks the fork rule) |
| Shell | `image tools [section] [path]`, plus headless verbs writing next to the original: `image trim`, `image split`, `image join`, `image unbg`. Sprites open the UI only. The `image` group is shared with Image Editor's `edit/convert/resize/rotate` | Open command only; nothing new |
| Release | 1.2.0 | Commit only |

## Action items

- [x] Image Tools app, delete the five apps, shell verbs, tests, docs, 1.2.0

## Implementation notes

- One image, or none, opens Remove background; several open Join; `section` wins. Remove background is the one section that does something to any image.
- Command options match the old apps: `image split` takes `--cols` or `--rows` (tiles are square), `image unbg` takes repeatable `--color` with exact matching (the old app had no tolerance), `image trim` keeps the `-cropped` suffix and the `--alpha` threshold.
- Sprites' settings moved from `app.sprite-extract.settings` to `app.image-tools.sprite-settings`; the old key is left behind.
