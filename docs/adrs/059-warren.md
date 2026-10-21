# ADR-059: Warren
**Date:** 2026-10-21
**Status:** Implemented

## Context
LaxDOTexe asked for a free word processor for CVs, letters and stories ([brainstorm](../brainstorm/2026-10-21_warren.md)). WebOS has no rich-text editing.

## Decision
- **App `warren`**, authors LaxDOTexe and the owner. Tool sidebar with collapsible groups on the left, the page on the right; narrow containers fold the sidebar into a sticky formatting bar plus a sheet.
- **Engine: Lexical** (`lexical`, `@lexical/rich-text`, `@lexical/list`, `@lexical/history` as needed), exact versions, app-scoped dependency (ADR-045). Used through its framework-agnostic core.
- **Native file `.warren`:** `{ version: 1, page: { size: "A4" | "Letter" | "A5", flow: "sheets" | "continuous" }, editor: SerializedEditorState }`. The envelope is zod-validated; the editor state is Lexical's own JSON. File association for open.
- **Features:** headings 1-3, bold, italic, font size, bullet and numbered lists; word and character counts; "Change everywhere" for the selected word (whole word, one undo step); user page breaks (a custom node); sheets or continuous.
- **Export:** `.docx` hand-written into `write_zip` (paragraph styles, runs with bold/italic/size, numbering for lists, page breaks, `sectPr` page size); PDF through `print_html` with `@page` size and `break-before: page`.
- **Spelling:** native `spellcheck` underline only.
- **Thesaurus:** repeated descriptive words counted locally; synonyms from AiService when available, hidden otherwise.
- **Shell:** `doc count <path>` yields words and characters; `doc export <path> --docx` writes a `.docx` beside it. Both read the `.warren` JSON without mounting an editor.

## Alternatives Considered
- Own block model on `beforeinput`: no dependency, but 1.5-2.5k lines and Android IME composition risk.
- `execCommand`: no model; replace-all and export would walk Chrome's inconsistent markup.
- `.docx` or HTML as the native format: lossy round-trips.
- nspell with dictionaries for a spelling list: ~200 KB gz per language; deferred.
- Datamuse thesaurus: sends the user's words to a third party.
- Automatic fixed-size pagination: needs JS measuring; rejected for user-placed breaks.

## Consequences
- A pinned 0.x dependency to upgrade by hand.
- The .warren file holds Lexical's schema; a Lexical upgrade that changes node JSON needs a migration in the envelope's `version`.
- Other people get .docx or PDF; Warren can't open their .docx yet (added in the finalize revision).
- No list of spelling errors.

## Revision 2026-10-21: implementation
- **Packages:** `@lexical/selection` and `@lexical/utils` joined the four named above, all at exactly 0.52.0.
- **Sheets are measured.** The editor is one `contenteditable`, and CSS can't give a run of siblings a minimum height, so after each update and resize the app measures each sheet and pads the break that closes it (`--fill`) to one page. Nothing is split; sheets still grow. On a narrow window the paper reflows at the window's width (keeping the page's proportions) rather than shrinking the page.
- **Change everywhere** matches case-insensitively and keeps the case of each occurrence (all caps, capitalised); a word split across differently formatted runs isn't matched.
- **History:** Lexical can't undo the first change after its history is cleared, so loading a document seeds the history with the loaded state.
- **.docx:** a page break becomes `pageBreakBefore` on the next paragraph; the document names Inter, which Word substitutes when it's missing. Core properties (`docProps/core.xml`) are included.
- **Shell:** `doc count` yields a `doc-count` value (name, words, characters; open launches Warren); `doc export` without `--docx` fails asking for a format.

## Revision 2026-10-21: finalize
Scope from the [finalize follow-up](../brainstorm/2026-10-21_warren.md#follow-up-2026-10-21-finalize): alignment and underline, .docx import, one body font, links, find and replace.

- **Format `version: 2`:** `page.font?: FontChoice` (Settings' type: `default`, `builtin`, `file` in `/etc/fonts`) and `link` nodes. Every save writes 2; a version 1 file opens unchanged; a Warren from before refuses 2 with its "newer Warren" message. A `default` font is dropped on read, so it never sits in a file.
- **Packages:** `@lexical/html` and `@lexical/link` at exactly 0.52.0, and `mammoth` 1.13.0, app-scoped. mammoth is `import()`ed on the first `.docx` (its own ~99 KB gz chunk); `warren.app` grew from 95 to 104 KB gz; the boot chunk is unchanged.
- **.docx import:** `.docx` joined the associations (no other app lists it, so nothing is taken over; a remembered default still wins). mammoth's HTML gets a style map for underline, page-break characters (`hr.page-break`, which `PageBreakNode.importDOM` reads) and Title/Subtitle. Alignment and `w:pageBreakBefore` (what Warren's own export writes) don't come back: mammoth doesn't expose them to the HTML. The notice counts pictures, tables and mammoth's warnings.
- **Links:** `LinkNode` is registered without `registerLink` (it wants the extension signals); the toolbar calls `$toggleLink` or edits the link at the caret. Mod+K isn't bound: it's the OS launcher, and a window shortcut would win over it inside Warren. Only `http`, `https` and `mailto` reach the exports.
- **Font loading:** the font loader moved from `settings/font-loader.ts` to `core/utils/font-loader.ts` (with `fetch_faces` for built-ins) so Warren loads the same faces; each window registers its own family name. The PDF embeds the faces as `data:` URLs; the .docx names the family (a file font by its file name) and the export warns that Word substitutes it.
- **Find and replace** shares `find_matches` / `replace_matches` with Change everywhere and paints matches with the CSS Custom Highlight API; replacing from the bar skips the DOM selection so focus stays in the bar.
