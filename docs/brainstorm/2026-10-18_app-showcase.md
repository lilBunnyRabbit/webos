# App showcase

**Date:** 2026-10-18
**Participants:** owner, Claude

## Context

Owner: an "app showcase", probably in the library, shareable as a solo link: "a nice organized showcase of all the applications explaining what they do, what they solve". 76 apps; every manifest has a one-line `description`, 27 have `highlights` cards. App Library is a store (Get / Open, details) with no props.

## Decisions

- **In the App Library** as a Showcase view, plus props `{ view?: "showcase" | "store", app?: AppId }`, so `#/solo/app-library?view=showcase` is the shareable link. Reuses manifests, icons, highlights, Get / Open.
- **New manifest field** `pitch?: { problem: string; solution: string }` (short, user-facing), written for all 76 apps now; the showcase falls back to `description`. Highlights still add feature cards. Changes `define_app` (app-api docs + test).
- **Layout: by category, story cards.** Hero intro, then categories, each a grid of cards: icon, name, problem → solution, top highlights, Open / Get, Copy solo link. Filter chips and search. A card opens a detail with preview and all highlights.
- **Shell: nothing.** Reached through App Library, the start menu and the solo link.
- Rejected: own system app (a second list of all apps), a Getting started section, a separate data file (copy drifts from the app), highlights for all as the only content (no problem framing), curated chapters (an order to maintain).
