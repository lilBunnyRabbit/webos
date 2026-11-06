# App discoverability

**Date:** 2026-11-06
**Participants:** owner, agents

## Context

With over a hundred apps, a new user reads an App Store card and still doesn't know what they'd actually do with the app. The description and the pitch say what the app is and what it solves; neither names one concrete task. Several discoverability ideas were proposed; the owner approved them on 2026-11-06 ("do the discoverability ideas"). The Discover page's Start here shelf, Ask box and named categories shipped in 4.3.0. This log covers idea 2, the "Try" examples, and idea 5, real screenshots on app pages.

## Topics discussed

### Idea 2: one concrete example per app

- **Decision:** one optional `AppMeta` field, `example?: string`, the owner told up front it adds a manifest field. One concrete thing you'd use the app for, an imperative phrase in lower case with no full stop, under about 40 characters ("shrink a photo under 1 MB", "scale a recipe for six people").
- It flows exactly like `description` and `pitch`: `meta.ts` → `manifest_data()` (build plugin and the dev glob) → `CatalogueApp` → AppsService's `text_of()` → `AppListing`.
- **Where it shows:** "Try: {example}" on App Store cards (one muted line under the pitch; the line is held empty for an app without one so cards never jump) and on the app page, under the What {name} does text. Not in list rows: they already fill two lines with the category and the description, so it's skipped there.
- **Search:** `search_apps` matches it alongside `description` (one line in its haystack). The sentence search was left as is.
- Every bundled app, system apps included (they're browsable in the App Store), got an example drawn from its real features: its meta, highlights and code, nothing invented. The spec's own "plan a week of meals" for Recipe Box became "scale a recipe for six people", since Recipe Box has no meal planner.

### Idea 5: real screenshots on app pages

- **Decision:** no new field. The manifest's existing `preview` (`() => import("./preview.webp?url")`), which the app page and the new-app announcement already rendered, gets filled for fifteen apps: the Start here six (Quick Notes, File Explorer, Calendar, Clock, Image Tools, Solitaire) plus PDF Tools, Video Tools, Recipe Box, Shopping List, Color Tools, Drive Hub, Sudoku, Minesweeper and Terminal.
- **Framing:** the app's window maximized at 1200×750 CSS px, DPR 1.25, Brand Light, WebP at quality 0.75. Every file came out between 15 and 50 KB.
- **Content:** never an empty state. Each app gets believable data written into OPFS before it opens (notes, a month of events, world clocks, a groceries list, Cooklang recipes, a home folder) or a few moves through its UI (a solitaire draw, three sudoku hints, a minesweeper opening, three terminal commands). Photos, the video and the PDF are generated on the fly (a painted landscape on a canvas, the app's own WebM encoder, pdf-lib), so no sample media lives in the repo.
- **Regenerating:** `scripts/previews/capture.mjs` (Playwright, Chromium) against `bun dev`, one fresh profile per app; scenes in `scripts/previews/scenes.mjs`. How to run it is in the `preview` row of `docs/system/apps/manifest.md`.
- **Display:** the app page holds a 16:10 `rounded-xl` box while the image loads, so the highlights below don't jump; the image fills it from the top. The announcement uses the same ratio.

## Key takeaways

- A task phrase does what the description can't: it tells a stranger when they'd reach for the app.
- A picture of the app with real-looking content answers "what is this" faster than any sentence.

## Action items

- [x] `example` on `AppMeta`, carried through the catalogue and AppsService
- [x] "Try: …" on App Store cards and the app page
- [x] An example in every app's `meta.ts`
- [x] Docs: manifest, App Store, apps service; changelog 4.4.0
- [x] App screenshots (idea 5): `preview.webp` for fifteen apps, the capture script in `scripts/previews/`, a steady 16:10 frame on the app page and the announcement

## Next session topics

- Whether the sentence search should weigh `example` too, and whether the launcher or the window guide should show it.
- A gallery (several pictures per app, or a phone shot next to the desktop one) would need a new manifest field: an owner call.
- Previews for the rest of the apps, and whether a CI check should flag a stale one when an app's UI changes.
