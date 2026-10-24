# App registry at scale
**Date:** 2026-10-22
**Participants:** owner, Claude

## Context
Follow-up to [2026-10-22_on-demand-apps](2026-10-22_on-demand-apps.md) and its scale rule ("the platform can contain a million apps and that should not affect any load time or anything").

Today:
- `src/lib/apps/index.ts` imports every app's `index.ts` eagerly (94 manifests).
- `app-boot` (67 KB raw, 13.5 KB gz) carries every manifest's icon, props and sections at boot.
- `app-meta` (13.5 KB gz, ADR-049) loads every app's text when the desktop goes idle.
- All 94 icons are local `icon.svelte` files: pure SVG in `currentColor`, about 60 KB of source, four wrapped in `ai_icon()` (kit) for the AI sparkle.

## Topics discussed

### Full catalog split (rejected)
The first round picked: boot loads only installed apps' manifests, a sharded static catalog (by id, extension, search prefix, category page), icons as SVG files, and the build extracting manifest data. The owner pulled back before round 2: "lets not get carried away. the manifest is fine to load we can't really get a way from that - that much. but yea we can limit the icon loading with some skeletons or something". All of round 1 is dropped except the icon direction.

### Manifests (decided)
Stay eagerly loaded, as today.

### Icons (decided)
- `icon.svelte` becomes `icon.svg`.
- The manifest's `icon` is the file's URL (`import icon from "./icon.svg?no-inline"`).
- One shared component draws it as a CSS mask over `currentColor`, so it keeps the theme colour.
- The browser only fetches icons that are drawn, with a skeleton square until then. No JS per icon.

Rejected: a lazy Svelte icon per app (a JS module per icon); measuring first (13.5 KB gz now, but it grows with every app).

### AI sparkle (decided)
Baked into the four SVG files. Rejected: an icon object `{ url, ai }` (the owner preferred no API for it); a manifest `ai` flag (a new field).

### Offline (decided)
OfflineService's sync (ADR-065) also fetches the icon of every installed app. Until it has run, offline tiles show the skeleton. Rejected: skeletons until online; icons in the core precache (grows with the app count).

### Coloured icons (decided during the build)
25 icons have a `primary` accent (one `secondary`), plus the AI sparkle. A single `currentColor` mask makes them monochrome, and `var(--primary)` doesn't resolve inside an image.

Decided: layered masks through SVG fragment views. Each file has `<view id="primary"/><view id="secondary"/>` and one `:target` style rule; the accent is marked `class="primary"` or `class="secondary"`. `AppIcon` stacks three masks: the file in `currentColor`, `#primary` in `--primary`, `#secondary` in `--secondary`. One file, one request, no JS per icon, `icon` stays a URL string. A test checks every file follows the convention.

Rejected: one monochrome mask (accents and the sparkle lose their colour); fetching the SVG text and inlining it (JS per icon).

### Version (decided during the build)
`icon` is a stable field, so its type change is a 4.0 break by app-api.md's rule. Shipped in 3.59.0 as an exception recorded there, with a migration row; 4.0's other removals stay for 4.0.

### Revisited 2026-10-24 (reverted)
Owner: "Okay this has been bothering me alot. the skeletons we have for icons. lets drop this idea and bring back the manifest loading in the initial load. i don't mind that name, description, icon (everything needed for listing apps) gets loaded on initial load", then "this load shouldn't take ages ist just text and icons".

Measured: all 94 icons 5.8 KB gz, descriptions 3.8 KB gz, all of `app-meta` 11.7 KB gz (raw source, before bundling).

- **Icons (decided):** revert 3.59's code to `icon.svelte` components in the manifest. Rejected: keeping `icon.svg` and importing `?raw` into an inline `{@html}` (keeps the files and the string type, but inserts markup); keeping the masks and preloading every file (94 requests, first boot still shows placeholders).
- **Listing text (decided):** AppsService awaits the existing `app-meta` chunk at boot instead of at idle, preloaded alongside `main`. No API change. Rejected: `description` back in the manifest (a second stable-field change, and search keywords would still wait); keeping the idle load.
- **Cost:** boot 189.3 → 210.1 KB gz; budget 190 → 215. Shipped as 3.61.0, a second recorded exception in app-api.md.

## Key takeaways
- The scale rule applies to what is heavy and grows; small manifest data stays.
- `define_app`'s `icon` changes type: a stable API change.

## Action items
- [x] ADR-066.
- [x] Build after ADR-065 merges (both touch OfflineService sync and `vite.config.ts`).

## Next session topics
- ~~`app-meta` still loads every app's text at idle~~: loads at boot since 2026-10-24; revisit if boot outgrows 215 KB gz.
