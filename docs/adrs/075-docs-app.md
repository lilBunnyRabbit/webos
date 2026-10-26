# ADR-075: Docs App
**Date:** 2026-10-26
**Status:** Implemented

> **Revision 2026-10-26: as built.** Decided inside the build:
> - **Kernel read.** The service graph needs each service's registered dependencies, which the kernel kept private. `Kernel.dependencies(key)` returns them, read-only; init order is `kernel.services`' order as before. Nothing else on the kernel changed.
> - **Where the visuals sit.** Each one tops the page it's drawn from: the service graph on `system/kernel`, a service's neighbourhood (needs, needed by, start position, swapped class) on its `system/services/{key}` page, the ADR timeline on `adrs/README`, the app atlas on `apps/README`, the persistence map on `system/persistence`, roadmap progress on `ROADMAP`. The platform and solo swaps show as live class names (`MobileWindowsService`), outlined in the graph.
> - **Props.** `page` also takes an anchor, `persistence#storage-map`; so does `docs`.
> - **Roadmap parser** moved to `$kit/utils/roadmap`: Settings and Docs both read it.
> - **Window state.** The open page is `storage.window` state, restored with the session like Settings' section; nothing else is stored.
> - **Search** loads every page chunk once per window to read titles and headings.

> **Revision 2026-10-26: home picked.** The owner picked the overview (A) as the home. The zoomable map (B) became its own page, id `map`: a Map entry under Home in the sidebar, a card on the home, `docs map` and `?page=map`. The temporary switch and its stored `home` window state are gone. `Kernel.dependencies(key)` is approved as built.

## Context
The WebOS docs are markdown in `docs/` and read like walls of text. The owner wants a visual way to explore them inside WebOS while the markdown stays the single source of truth ([brainstorm](../brainstorm/2026-10-26_docs-app.md)).

## Decision
A system app, `docs` ("Docs").

- **Content:** `import.meta.glob("/docs/{system,adrs,design,apps}/**/*.md", { query: "?raw", import: "default" })` plus `docs/ROADMAP.md`, each page a lazy chunk. Page id = path under `docs/` without `.md` (`system/services/windows`, `adrs/047-solo-app-open`); short aliases resolve (`windows`, `adr 47`). Rendered with `marked` (a per-app dependency, ADR-045). Brainstorm and source-file links open on GitHub; links between docs open in place.
- **Generated visuals, no second copy:**
  - Service graph: from the live kernel registry (services, dependencies, init order).
  - ADR timeline: from the `docs/adrs/README.md` index table (number, title, date, status) and each ADR's revision notes count.
  - App atlas: the app registry joined with `docs/apps/*.md` (icon, category, Launch, internals page when present; apps missing in a fork are skipped).
  - Persistence map: parsed from `docs/system/persistence.md`'s storage tables.
  - Roadmap progress, reusing Settings' `parse_roadmap`.
  Parsers are pure `.ts` with tests that pin the table and heading shapes they read.
- **Layout:** sidebar (groups, title/heading search) + page + table of contents; mobile: drawer + contents sheet. Home: two variations built (overview cards, zoomable map), one kept after the owner picks (revision: the overview is the home, the map its own page).
- **Props:** `page?: string`.
- **Shell:** `docs [topic]` (manifest `shell`), completion over page ids and aliases.
- **Kernel:** each service inspector links "Open docs" to `system/services/{key}`.
- No persistence.

## Alternatives Considered
- User app: a fork that deletes user apps loses the OS's own docs.
- Its own shell screen: a new surface on both platforms for content an app window holds.
- Visual fences inside the markdown: GitHub shows them as code blocks; every author learns the syntax.
- Rendering markdown only: still loads of text.

## Consequences
- The precache grows by the docs' size (about 1.7 MB), and an update that changes docs re-downloads those chunks.
- Doc shapes the parsers read (ADR index table, persistence tables, roadmap) become a contract, guarded by tests.
- A doc change shows up in the app on the next build, with no second place to edit.
