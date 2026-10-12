# Text Editor

**Date:** 2026-10-13
**Participants:** owner, Claude

## Context

ROADMAP lists the Text Editor first among the small apps, waiting on the close guard (done in ADR-029) and a dependency answer (CodeMirror, gap G5 in the [app candidates](2026-10-12_app-candidates.md) brainstorm). Text Viewer is a read-only system app (`text/*` plus 11 extensions, line numbers, wrap, Copy all). Paint already has the editor plumbing: `pick_file` / `pick_save`, `set_dirty` with a save, `set_title`, and window-scoped Mod+S through ShortcutsService.

## Topics

| Question | Decision | Rejected |
|----------|----------|----------|
| Viewer vs editor | **Text Viewer becomes the Text Editor.** One app | Separate editor with the viewer as default (two apps on `text/*`, an extra click to edit); separate editor as default |
| App id | **Rename to `text-editor`, no alias.** Old session entries for `text-viewer` are skipped on restore, a custom `text-viewer` file default falls back to the built-in | Alias in the apps registry (a permanent special case); keeping the `text-viewer` id under the new name |
| Engine | **CodeMirror 6.** `codemirror` plus `@codemirror/lang-{javascript,json,markdown,css,html,yaml}`, approved. Lazy with the app chunk; languages load per file | `<textarea>` (no highlighting, line numbers only without wrap); core only; js/json only |
| Edit mode | **Always editable.** The dirty dot and close guard catch stray edits | Read-only with an Edit toggle |
| File changed elsewhere | **Like code editors:** a clean buffer reloads, keeping cursor and scroll; a dirty one shows a banner (Reload / Keep mine); Save asks before overwriting a newer file. Watched with `files.revision(parent)` plus `lastModified`, no new infrastructure | Last save wins; banner only |
| In-app keys | **ShortcutsService, like Paint.** Commands (Save, Save as, Open) register per window and show in Mod+/. Continuous game input (arrows in Snake) stays on the app root. Settles the open shortcuts convention | Root `keydown` per app |

## Key takeaways

- One app, one id, no migration code: the owner accepts losing old Text Viewer windows from a saved session.
- Dependency approved: CodeMirror core and six language packages. Svelte, TOML, INI and `.env` open as plain text.
- The shortcuts question from batch 1 is closed: commands go through ShortcutsService.

## Action items

- [x] ADR-030
- [ ] Build: rename the app, CodeMirror themed from tokens, open / save / save as / new, close guard, title, disk watch
- [ ] System reference, design docs, changelog

## Next session topics

- Block 6: wallpapers, desktop auto-arrange, Theming ADR-015
- Markdown Viewer: a preview mode in the editor or its own app
