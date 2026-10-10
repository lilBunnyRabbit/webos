# ADR-018: File Associations
**Date:** 2026-10-11
**Status:** Implemented (2026-10-11)

> **Revision 2026-10-11: implementation notes**
> - `file_defaults` was added to settings without bumping `SETTINGS_VERSION`: the field is additive, so older saves load with `{}` instead of being discarded with the theme. Entries must be `".ext" → string`.
> - The chooser focuses the first app; ArrowUp/ArrowDown move, Enter picks. A file without an extension hides "Always use".
> - AppsService now depends on `settings` and `dialogs` as well.

> **Revision 2026-10-11: dotfiles**
> - A dotfile is its own extension: `.env` → `".env"`. Before this, dotfiles had no extension, so Text Viewer's `.env` entry could never match a file named `.env`. Dotfiles now also get the "Always use" checkbox.

> **Revision 2026-10-11: PDF in its own app**
> - PDF went into a separate PDF Viewer app (`application/pdf`, `.pdf`), not into Media Preview. It's an iframe on a blob URL showing Chrome's built-in viewer, so Media Preview's zoom/rotate toolbar doesn't apply. The rule: one app per interaction model, not per format. A format that refines an existing match (for example `.md` over `text/*`) gets its own app at a higher tier, and "Open with" picks between them.

## Context

Double-clicking a file in File Explorer does nothing. The shell's `open` command (ADR-007), file deep links (ADR-010) and session restore (ADR-014) all need the same thing: given a file, pick an app and launch it with that file. ADR-007 sketched an `associations` manifest field and left the prop shape open. No app handles files yet.

Brainstorm: [2026-10-11 File Associations](../brainstorm/2026-10-11_file-associations.md)

## Decision

### 1. Manifest field: extensions and MIME patterns

```ts
define_app({
  id: "media-preview",
  associations: ["image/*", "video/*", "audio/*", ".heic"],
  props: FILE_PROPS,
  component: () => import("./media-preview.app.svelte"),
});
```

An entry starting with `.` is an extension (case-insensitive). Anything else is a MIME type, exact (`image/svg+xml`) or wildcard (`image/*`).

### 2. File prop: a path

```ts
export const FILE_PROPS = z.object({ path: z.string() });
```

Apps that open files declare `FILE_PROPS` (or extend it) as their ADR-008 schema and look the file up themselves. A path is JSON, so it survives URLs (ADR-010) and saved sessions (ADR-014); a handle or `File` would not. Name and extension are derived from the path, never passed separately.

FilesService gains a path lookup:

```ts
get_file(path: string): Promise<File | null>;
```

### 3. Resolution: specificity tiers

`AppsService.open(path, options?)` reads the file (MIME needs `File.type`), then:

1. A remembered default for the extension wins, if that app still exists.
2. Otherwise each app scores its best matching entry: exact extension 3, exact MIME 2, MIME wildcard 1.
3. One app on the best tier: launch it with `{ path }`.
4. Several apps tie on the best tier: show the "Open with" chooser (ADR-019).
5. No match: warning notification "No app can open {name}".

### 4. Chooser: dropdown at the cursor

A light-dismiss list of the tied apps (icon + name), shown through DialogsService (ADR-019):

```
┌───────────────────────┐
│ ▣ Media Preview        │
│ ▤ Text Viewer          │
├───────────────────────┤
│ ☐ Always use for .svg  │
└───────────────────────┘
```

- Anchored at the click position. Without one (shell, deep link), centered over the focused window, else over the desktop. Keyboard Enter in File Explorer anchors to the row.
- Clicking an app opens it immediately. Arrow keys and Enter work. Esc or click outside cancels; nothing opens.
- With "Always use" checked, the choice is saved per extension.

### 5. Remembered defaults

SettingsService persists `file_defaults: Record<string, AppId>` (extension → app) in its versioned key. A default pointing at a missing app is ignored. Resetting them is a later Settings-app item.

### 6. Callers

- File Explorer: double-click and Enter on a file call `apps.open(path, { anchor })`.
- Shell `open` (ADR-007) and `#/file/{path}` (ADR-010) call the same method when they exist.

### 7. First consumers

- **Media Preview** (port from `master`): image, video, audio.
- **PDF Viewer** (new): native browser viewer in an iframe. See the revision note.
- **Text Viewer** (new): plain text formats, read-only `<pre>`. Grows into the Text Editor.

## Alternatives Considered

- **Prop `{ file: { path, name, extension } }`** (ADR-007 sketch): name and extension duplicate the path and can drift.
- **Pass a handle or `File`** (legacy): no lookup, but not JSON; breaks deep links and session restore.
- **Extensions only**: works from a path alone without reading the file, but can't say "all images".
- **First match wins + toast**: no UI, but the user can't choose.
- **Centered modal chooser**: works without a cursor, but heavier than the owner wants.
- **Ask every time / remember silently**: annoying, or surprising with no visible way back.

## Consequences

### Positive
- One resolution path for explorer, shell and deep links.
- File-handling apps share one schema and one lookup.
- The user decides real ambiguities, once.

### Negative
- `open()` is async and reads the file before choosing an app.
- An app can take precedence over a type by listing its extension explicitly.
- Two apps and a dialog system to build before the feature is visible.

## Related
- ADR-007 (shell `open`), ADR-008 (props), ADR-009 (Media Preview), ADR-010 (deep links), ADR-014 (session restore), ADR-019 (dialogs)
