# File Associations

**Date:** 2026-10-11
**Participants:** Owner, Claude

## Context

Double-clicking a file in File Explorer does nothing: `file-list.svelte:60-67` only handles Delete on files, directories get `ondblclick`/Enter. ROADMAP has "File explorer: file open callback" (P0) and a P3 "File Associations" block (`associations` manifest field, `open` in AppsService, standard `file` prop).

Prior art:

- **ADR-007** (shell): `associations: [".png", ".jpg"]` on the manifest; `open ./photo.png [--app=x]` lives in AppsService, not the shell; launches with `{ file: { path, name, extension } }`. The prop shape was left "to be defined when associations are implemented".
- **ADR-010** (deep links): `#/file/{path}` resolves the association. `#/app/{id}?props` puts props in a URL.
- **ADR-014** (session restore): saves open windows with their props.
- **ADR-008** (just implemented): props reach an app only through its zod schema.
- **ADR-009**: Media Preview (port from React `master`) is "opened from File Explorer via file associations".
- **Legacy** `master:src/apps/media-preview`: received a `File` object as a prop, detected kind by MIME with extension fallback.

What the code says:

- No app handles files today. The first consumer would be a Media Preview port or a new viewer.
- File items carry `name`, `handle` (`FileSystemFileHandle`), `size`, `last_modified`, `type` (MIME from `File.type`, empty for unknown extensions).
- FilesService addresses directories by segments (`directory(segments)`), files only by handle. There is no "path → file" lookup.
- Props that go into a URL (ADR-010) or into saved session state (ADR-014) must be JSON. A `FileSystemFileHandle` or `File` is not.

## Topics

### Round 1

| Question | Decision | Rejected |
|----------|----------|----------|
| Prop shape | `{ path: string }`, one shared `FILE_PROPS` schema. Name/extension derived from the path. Needs a FilesService path lookup (`get_file(path)`) | `{ file: { path, name, extension } }` (ADR-007 sketch; duplicates the path); handle/`File` (not JSON, breaks ADR-010 deep links and ADR-014 restore) |
| Matching | Both extensions (`.heic`) and MIME patterns (`image/*`) in `associations` | Extensions only (Claude's pick); MIME only |
| Several or no matches | Ask when ambiguous. Owner: "more like a dropdown of options or just a list, like Windows handles it" | First match + toast (Claude's pick); per-extension defaults in settings |
| First consumers | Media Preview port (image/video/audio) and a plain text viewer | Either one alone |

Follow-ups raised by these answers: precedence between extension and MIME matches, what the chooser looks like and where it renders (the shell and deep links have no window to host it), whether the choice is remembered, and whether the chooser is generic dialog infrastructure.

### Round 2

| Question | Decision | Rejected |
|----------|----------|----------|
| Precedence | Specificity tiers: exact extension (3) > exact MIME (2) > MIME wildcard (1). Chooser only when several apps tie on the best tier | All matches equal |
| Chooser UI | Dropdown at the cursor, non-modal list of apps | Centered modal dialog (Claude's pick) |
| Remember | "Always use this app" checkbox, saved per extension in SettingsService (persisted) | Ask every time; remember silently |
| Infrastructure | Generic system dialog layer: `dialogs.show(Component, props) → Promise` | Single-purpose component on AppsService (Claude's pick) |

Consequences found while recording:

- MIME tiers need `File.type`, so `open(path)` reads the file before choosing an app. It's async.
- A cursor position exists only for File Explorer/desktop clicks. The shell and deep links need a fallback.
- The generic layer is the first system UI outside windows, and needs a shape: service or not, anchoring, dismissal, mobile.

### Round 3

| Question | Decision | Rejected |
|----------|----------|----------|
| Dialog layer home | New `dialogs` kernel service with a reactive stack, one host component at the web-os root | Module store without a service |
| No cursor position | Centered over the focused window, else the desktop | Desktop center always (Claude's pick) |
| Dropdown UX | Light dismiss (Esc, click outside = cancel), clicking an app opens it, checkbox row "Always use for .ext" at the bottom | Two entries per app |

### Round 4: building the dialogs host (step 5)

| Question | Decision | Rejected |
|----------|----------|----------|
| Keeping anchored dialogs on screen | CSS anchor positioning with `position-try-fallbacks` | JS clamp on mount; no edge handling |
| Dismissal, focus, stacking | Native `<dialog closedby="any">` + `showModal()`. Found by checking for a native API before hand-rolling (new standing rule in CLAUDE.md). Modal: outside click closes, doesn't pass through | `popover="manual"` with hand-written Esc/pointerdown/focus handling (non-modal) |

Owner standing rule from this round: use the latest web platform features, target the owner's browser only, and always check for a newer native API before building behaviour by hand.

### Defaults Claude chose (recorded in ADR-018/019)

- No match: warning notification "No app can open {name}". Round 1 covered "several match"; nothing to ask when none do.
- A remembered default wins before tier matching and is ignored if its app no longer exists.
- Keyboard Enter in File Explorer anchors the dropdown to the row, not the window.
- Open dialogs resolve `null` on service shutdown.
- Mobile presentation of dialogs left open.

## Key takeaways

1. Files travel between apps as `{ path }`. Apps look the file up themselves.
2. Matching is extension or MIME, ranked by specificity. The user only chooses on a real tie, and can make it stick.
3. The chooser is the first consumer of a generic DialogsService (ADR-019), not a one-off.
4. Written up as ADR-018 (file associations) and ADR-019 (system dialogs).

## Action items

- [x] ADR-018, ADR-019, roadmap
- [x] Implement in order: `get_file` + `FILE_PROPS`, Text Viewer, `associations` + `open()`, File Explorer wiring, DialogsService + host, Open-with dropdown + `file_defaults`, Media Preview port (all 2026-10-11)

## Next session topics

- Mobile presentation for dialogs (ADR-016).
- Whether ADR-003 window overlays reuse the dialogs host.
- Settings UI to reset `file_defaults`.
- File Explorer context menu "Open with" (needs context menus).
