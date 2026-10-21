# Warren

Id `warren` · Source: `src/lib/apps/user/warren/` · [brainstorm](../brainstorm/2026-10-21_warren.md) · [ADR-059](../adrs/059-warren.md), [ADR-045](../adrs/045-scoped-app-dependencies.md) (app-scoped packages)

## What it does

A word processor for CVs, letters and stories. Headings 1–3, bold, italic, underline, font size, alignment (left, centre, right, justify), bullet and numbered lists, word and character counts, user-placed page breaks on A4, Letter or A5 sheets, "Change everywhere" for a word, a list of the words used most, and synonyms from on-device AI where Chrome has it. Saves `.warren` files; exports `.docx` for Word and PDF through the print dialog. Idea from LaxDOTexe.

## How it works

### Editor: Lexical, framework-agnostic

`lexical.ts`, `editor.svelte.ts`. `createEditor` with `HeadingNode`, `ListNode`, `ListItemNode` and `PageBreakNode`, then `registerRichText`, `registerList` and `registerHistory` (400 ms merge window), and `setRootElement` on the page's `contenteditable` through an attachment. No React, no Svelte binding package.

Every Lexical `$` function lives in `lexical.ts`: Svelte reserves the `$` prefix in `.svelte.ts`, so `WarrenEditor` (runes) only calls plain wrappers. `WarrenEditor` keeps the reactive mirror the UI reads: `json` (the serialized state, replaced on every content change), the selection's `bold`, `italic`, `underline`, `align`, `block` and `size`, the selected `word`, `can_undo` / `can_redo`, and `dirty` (a revision counter against the saved one; page settings count as changes).

| Piece | Where | Notes |
|-------|-------|-------|
| Page break | `page-break-node.ts` | A `DecoratorNode` with `$config()` type `page-break`, a `contenteditable=false` `div.page-break`, inserted with `$insertNodeToNearestRoot` (splits a list it's in) |
| Block style | `lexical.ts:set_block` | Headings and body through `$setBlocksType`; lists through `INSERT_*_LIST_COMMAND` / `REMOVE_LIST_COMMAND`. Tab and Shift+Tab indent and outdent inside a list only, so Tab still leaves the editor elsewhere |
| Alignment | `editor.svelte.ts:set_align` | `FORMAT_ELEMENT_COMMAND` (rich text handles it) writes the element's `format`; Lexical's reconciler sets `text-align` on the block. The current value is read from the list item, else the top-level block; `start`/`end` read as left/right |
| Font size | `lexical.ts:set_size` | `$patchStyleText` writes `font-size: Npt` into the text node's `style` |
| Undo after open | `lexical.ts:create_lexical` | Lexical's history can't undo the first change after a clear (it has no state to go back to), so `reset_history` sets `history.current` to the loaded state |

Formatting buttons cancel `pointerdown`, so the editor keeps focus and its selection on mouse and touch.

### Words

`words.ts`, pure. A word is `[\p{L}\p{N}]+` joined by `'`, `’` or `-`, so "don't" and "well-known" are one word each. Characters count spaces but not the line ends between blocks. Both counts come from `document_text(json)` (`model.ts`), the same walk the shell uses, so the app and `doc count` always agree.

- **Change everywhere** (`lexical.ts:change_everywhere`): every text node gets `replace_word` (whole words, case-insensitive; an all-caps or capitalised occurrence gets the replacement in the same case), in one update tagged `HISTORY_PUSH_TAG`, so one Undo restores all of them. Selection points in changed nodes move with `map_offset`, so the selection stays on the new word. A word split across differently formatted runs ("**fa**st") isn't matched.
- **Used most** (`repeated_words`): words of four letters or more, not in an English stop-word list, used at least twice; the top eight. Clicking one selects its next occurrence after the selection, wrapping.
- **Synonyms**: shown only when `ai.features.prompt` isn't `no` (so never on mobile). `ai.extract` with `{ synonyms: string[] ≤ 8 }`; a chip fills the "Change to" field.

### Sheets

`sheets.ts`, `warren.app.svelte`. The paper is one `contenteditable`, so the sheets are drawn, not nested: in Sheets flow a page break is a band as wide as the paper (`margin-inline` minus the paper's padding) whose background is paper, desk, paper. CSS can't give a run of siblings a minimum height, so `fill_sheets` measures after each update and resize: each break gets `--fill` (its top padding) so the sheet before it is at least one page tall, and the root gets `--tail` for the last sheet. Page height is the paper's width × height/width of the page size, so on a phone the sheet keeps the page's proportions. Sheets grow past a page; nothing is split automatically (ADR-059).

The paper is `min(page width, 100cqi − gutter)` wide with `min(margin, 7cqi)` padding, so text reflows on a narrow window instead of shrinking; the printed page uses the real size and margins. The paper takes Brand Light's tokens (scoped CSS variables), like Markdown to PDF's preview. Continuous flow drops the sheet chrome and shows a break as a labelled rule.

### Layout

At `@container (width >= 44rem)` the tools are a 15rem sidebar of `<details>` groups (Text, Paragraph, Page, Words, Export; open state in app storage `groups`). Below that the sidebar is hidden and a formatting bar sits above the page (bold, italic, underline, paragraph style select, bullets, numbers, More); More opens the same groups in a bottom sheet (the Ask pattern). Spelling is the browser's own `spellcheck` underline.

### Export

The editor state is walked into blocks (`model.ts:blocks_of`): paragraph, heading (h4–h6 from paste count as h3), list item (kind, level, list id, start) and page break, each with its alignment (`align_of`: the element `format`, `null` when unset) and runs (bold, italic, underline, strike, size in pt; a `linebreak` is `\n`, a tab `\t`).

**.docx** (`docx.ts`), written into `write_zip` (deflate):

| Part | Holds |
|------|-------|
| `[Content_Types].xml`, `_rels/.rels`, `word/_rels/document.xml.rels` | The package wiring: document, styles, numbering, core properties |
| `word/document.xml` | One `w:p` per block; runs with `w:b`, `w:i`, `w:u`, `w:strike`, `w:sz` (half points); `\n` → `w:br`, `\t` → `w:tab`. Alignment is `w:jc` (`both` for justify), written in the schema's `w:pPr` order (style, page break, numbering, justification). A page break becomes `w:pageBreakBefore` on the next paragraph (a trailing one, a `w:br w:type="page"`). `w:sectPr` with `w:pgSz` and `w:pgMar` in twips |
| `word/styles.xml` | Defaults (Inter, 11 pt, line 1.4, 6 pt after), `Normal`, `Heading1`–`3` (22 / 16 / 13 pt bold, keep with next, outline levels), `ListParagraph` |
| `word/numbering.xml` | Abstract 0 bullets (• ◦ ▪), abstract 1 numbers (decimal, lower letter, lower roman), nine levels at 0.5 in steps; one `w:num` per list with a `startOverride`, so each list restarts |
| `docProps/core.xml` | Title (the file name), creator "Warren", dates |

Characters XML can't hold (C0 controls) are dropped. A browser test parses every part with `DOMParser` and checks every relationship target exists. Not opened in Word or LibreOffice yet (neither is on the build machine).

**PDF** (`print.ts`): `print_document` builds a standalone page for `print_html`: `@page { size: A4|letter|A5 portrait; margin }`, Inter embedded with `@font-face`, Brand Light ink, and `div.break { break-before: page }`; an aligned block carries `style="text-align:…"`. `document_css(scope)` is shared with the editor, so heading sizes, list markers and spacing match what was typed. Rendered through Chromium's PDF printer, the sample is two Letter pages.

Shared numbers are in `page.ts`: page sizes and margins (A4 and Letter 20 mm, A5 15 mm), body 11 pt, headings, line height, paragraph spacing.

## Data

`.warren`, JSON, zod-checked envelope (`format.ts`):

```json
{ "version": 1, "page": { "size": "A4", "flow": "sheets" }, "editor": { "root": { "type": "root", "children": [] } } }
```

`size` is `A4`, `Letter` or `A5`; `flow` is `sheets` or `continuous`. `editor` is Lexical's own `SerializedEditorState`; the envelope checks only `root` and that each node has a `type`, and Lexical's `parseEditorState` rejects anything else when the app opens it. A file from a newer format version is refused with a message. Saves go wherever the user picks (`/home/Documents` by default); the window title is the file name, unsaved changes mark the window dirty and closing asks.

Props: `{ path }` (`FILE_PROPS`); `.warren` is associated, so `open x.warren` and a double-click open it.

Shell (`commands.ts`, `shell.ts`), both reading the JSON without Lexical:

| Command | Yields |
|---------|--------|
| `doc count <path>` | A `doc-count` value: name, words, characters; open → Warren |
| `doc export <path> --docx` | The `file` written beside it as `name.docx`, `name (1).docx` when taken |

Path completion is filtered to `.warren`.

## Dependencies & licences

`lexical`, `@lexical/rich-text`, `@lexical/list`, `@lexical/history`, `@lexical/selection`, `@lexical/utils`, all exactly 0.52.0, MIT, in the app's own `package.json` (ADR-045). They pull in `@lexical/extension`, `@lexical/clipboard`, `@lexical/html` and friends at the same version and `@preact/signals-core`. All load with the app's lazy component: `warren.app` is 293 KB, 95 KB gz (production build, 2026-10-21); the boot chunk is unchanged.

## Limits

- No spelling list (Chrome's underline only), no .docx or PDF import, no `.doc`.
- The .docx names Inter; Word without it substitutes a font, so line breaks can differ.
- On a narrow window lines reflow differently from the printed page.
- A Lexical upgrade that changes node JSON needs a migration under the envelope's `version`.
- Change everywhere and Used most see words inside one text run only.
- Stop words are English.
- Synonyms untested against the real model (no Gemini Nano on the build machine).

## Decisions

- [Brainstorm, 2026-10-21](../brainstorm/2026-10-21_warren.md)
- [ADR-059](../adrs/059-warren.md)
