# App discoverability

**Date:** 2026-11-06
**Participants:** owner, agents

## Context

With over a hundred apps, a new user reads an App Store card and still doesn't know what they'd actually do with the app. The description and the pitch say what the app is and what it solves; neither names one concrete task. Several discoverability ideas were proposed; the owner approved them on 2026-11-06 ("do the discoverability ideas"). The Discover page's Start here shelf, Ask box and named categories shipped in 4.3.0. This log covers idea 2, the "Try" examples.

## Topics discussed

### Idea 2: one concrete example per app

- **Decision:** one optional `AppMeta` field, `example?: string`, the owner told up front it adds a manifest field. One concrete thing you'd use the app for, an imperative phrase in lower case with no full stop, under about 40 characters ("shrink a photo under 1 MB", "scale a recipe for six people").
- It flows exactly like `description` and `pitch`: `meta.ts` → `manifest_data()` (build plugin and the dev glob) → `CatalogueApp` → AppsService's `text_of()` → `AppListing`.
- **Where it shows:** "Try: {example}" on App Store cards (one muted line under the pitch; the line is held empty for an app without one so cards never jump) and on the app page, under the What {name} does text. Not in list rows: they already fill two lines with the category and the description, so it's skipped there.
- **Search:** `search_apps` matches it alongside `description` (one line in its haystack). The sentence search was left as is.
- Every bundled app, system apps included (they're browsable in the App Store), got an example drawn from its real features: its meta, highlights and code, nothing invented. The spec's own "plan a week of meals" for Recipe Box became "scale a recipe for six people", since Recipe Box has no meal planner.

## Key takeaways

- A task phrase does what the description can't: it tells a stranger when they'd reach for the app.

## Action items

- [x] `example` on `AppMeta`, carried through the catalogue and AppsService
- [x] "Try: …" on App Store cards and the app page
- [x] An example in every app's `meta.ts`
- [x] Docs: manifest, App Store, apps service; changelog 4.4.0
- [ ] App screenshots (idea 5), built separately

## Next session topics

- Whether the sentence search should weigh `example` too, and whether the launcher or the window guide should show it.
