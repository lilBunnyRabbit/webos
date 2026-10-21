# Warren

Id `warren` · Source: `src/lib/apps/user/warren/` · [brainstorm](../brainstorm/2026-10-21_warren.md) · [ADR-059](../adrs/059-warren.md), [ADR-045](../adrs/045-scoped-app-dependencies.md) (app-scoped packages)

## What it does

A word processor for CVs, letters and stories. Headings 1–3, bold, italic, underline, strikethrough, subscript, superscript, clear formatting, font size, alignment (left, centre, right, justify), links, one body font per document (Inter, Burrow or a font from `/etc/fonts`), bullet, numbered and check lists, horizontal lines, an outline of the headings, word and character counts with reading time, selection counts and a word goal, smart quotes and dashes, find and replace (Mod+F), pictures (pasted, dropped, picked or taken with the camera on a phone; sized, aligned, described), page setup (A4, Letter or A5, portrait or landscape, Normal, Narrow, Wide or custom margins), headers and footers with their own formatting, pictures and page numbers, templates (CV, cover letter, letter, report, and the user's own in `/home/Templates`), user-placed page breaks on sheets, "Change everywhere" for a word, a list of the words used most, and synonyms from on-device AI where Chrome has it. Saves `.warren` files; opens Word `.docx` files as new documents, pictures included; exports `.docx` for Word and PDF through the print dialog. Idea from LaxDOTexe.

## How it works

### Editor: Lexical, framework-agnostic

`lexical.ts`, `editor.svelte.ts`. The editor is built from Lexical Extensions: `buildEditorFromExtensions` (`@lexical/extension`) with one root extension, `@webos/warren`, that holds the namespace, theme and error handler and depends on:

| Extension | Brings |
|-----------|--------|
| `RichTextExtension` | Headings, rich-text keys (bold, italic, underline, Enter, Backspace…), paste, plus its own dependencies (Dragon, inline and triple-click normalising) |
| `HeadingAnnounceExtension`, configured `disabled` | Rich text's screen-reader heading announcements are off: opening a document would announce every heading in it |
| `ListExtension` | `ListNode`, `ListItemNode`, the list commands |
| `CheckListExtension` | `INSERT_CHECK_LIST_COMMAND`, `checked` on list items, the click and keyboard toggles |
| `HorizontalRuleExtension` (`@lexical/extension`) | `HorizontalRuleNode` (type `horizontalrule`, an `<hr>` with the theme's `wr-rule`), `INSERT_HORIZONTAL_RULE_COMMAND`, click to select it |
| `LinkExtension` | `LinkNode`, its transform and `TOGGLE_LINK_COMMAND` (Warren calls `$toggleLink` itself) |
| `PageBreakExtension` (`page-break-node.ts`) | `PageBreakNode` |
| `ImageExtension` (`image-node.ts`), configured | `ImageNode`, click to select it, `DRAG_DROP_PASTE` (pasted and dropped picture files) handed to `WarrenEditor.insert_pictures`, the `selected` class on the selected picture |
| `NestedEditorExtension` (`@lexical/extension`), header and footer only | `parentEditor` is the body: selecting in one editor clears the others' selection, so there's one caret and one toolbar target |
| `HistoryExtension`, delay 400 ms | Undo and redo; its `canUndo` / `canRedo` signals drive the toolbar through an `effect` in the root extension's `register` |
| `InitialStateExtension`, configured | The first empty paragraph is written in a discrete update tagged `warren-load`, so a new editor isn't dirty |

The root extension's `register` also binds Tab and Shift+Tab (indent inside a list only) and runs smart punctuation (below). `editor.dispose()` undoes every registration. `setRootElement` on the page's `contenteditable` through an attachment, inside `untrack`: the commit runs the update listeners, which read `active`, and a tracked read would re-run the attachment (and re-mount, stealing focus) whenever another zone took focus. No React, no Svelte binding package.

`create_lexical(hooks, parent?)` builds the body, and with `parent` a header or footer: the same extensions (so anything pasted from the body has its nodes), its own history, plus `NestedEditorExtension`. Lexical sends a command a zone doesn't handle on to the body; the zones register the same handlers, so nothing falls through.

Every Lexical `$` function lives in `lexical.ts`: Svelte reserves the `$` prefix in `.svelte.ts`, so `WarrenEditor` (runes) only calls plain wrappers. `WarrenEditor` owns three Lexical editors: the body (`lexical`) and `zones.header` / `zones.footer`, created up front and mounted only while switched on. `active` is the one with focus (a `focusin` on its root); the format mirror, `can_undo` / `can_redo` (one history each) and every toolbar command follow it, while Find, Change everywhere, the outline, the counts and page breaks stay on the body. A zone is "on" when its JSON is in `header_json` / `footer_json`; `set_zone(zone, false)` empties it and drops it from the snapshot. It keeps the reactive mirror the UI reads: `json` (the serialized state, replaced on every content change), the selection's `bold`, `italic`, `underline`, `align`, `block` and `size`, the selected `word`, `can_undo` / `can_redo`, and `dirty` (a revision counter against the saved one; page settings count as changes).

| Piece | Where | Notes |
|-------|-------|-------|
| Page break | `page-break-node.ts` | A `DecoratorNode` with `$config()` type `page-break`, a `contenteditable=false` `div.page-break`, inserted with `$insertNodeToNearestRoot` (splits a list it's in) |
| Block style | `lexical.ts:set_block` | Headings and body through `$setBlocksType`; lists through `INSERT_*_LIST_COMMAND` / `REMOVE_LIST_COMMAND`. Tab and Shift+Tab indent and outdent inside a list only, so Tab still leaves the editor elsewhere |
| Alignment | `editor.svelte.ts:set_align` | `FORMAT_ELEMENT_COMMAND` (rich text handles it) writes the element's `format`; Lexical's reconciler sets `text-align` on the block. The current value is read from the list item, else the top-level block; `start`/`end` read as left/right |
| Links | `lexical.ts:set_link`, `warren-link.svelte` | `LinkNode` from `@lexical/link`'s `LinkExtension`: pasted and imported `<a>` come in through its `importDOM`, which also blanks unsafe URLs. A selection is wrapped with `$toggleLink`; a caret inside a link edits or unwraps that link; a caret elsewhere inserts the URL as linked text. The field takes what people type: `normalize_url` makes `example.com` `https://example.com` and `jane@example.com` a `mailto:`, and refuses other schemes. The form is a `popover="auto"` anchored to the Link button (`position-area`, flip fallbacks) on desktop and a bottom sheet on the mobile shell; from the More sheet it closes the sheet first and the popover centres itself. Mod+K isn't bound: it's the OS launcher, and a window shortcut would win over it inside Warren |
| Body font | `warren.app.svelte`, `io.ts:font_sources` | `page.font` is a Settings `FontChoice`. Built-ins are fetched (`fetch_faces`), `/etc/fonts` files read and split per face (`file_faces`, a `.ttc` becomes one face each), then `load_faces` registers them as `warren-{window}-{n}` in `document.fonts`, so two windows in two fonts don't share a family. The paper gets `--doc-font`; `document_css` puts it ahead of Inter. A font that fails to load leaves the choice in the document, shows Inter and warns |
| Font size | `lexical.ts:set_size` | `$patchStyleText` writes `font-size: Npt` into the text node's `style` |
| Strike, sub, super | `editor.svelte.ts` | `FORMAT_TEXT_COMMAND` with `strikethrough`, `subscript`, `superscript` (Lexical keeps sub and super exclusive). Window shortcuts Mod+Shift+X, Mod+Shift+, and Mod+Shift+. (Mod+, is the OS's Settings) |
| Clear formatting | `lexical.ts:clear_formatting` | `selection.extract()` splits the edge text nodes, then each gets format 0 and no `style` (so font sizes go too); links and paragraph styles stay. A caret clears what the next typed text gets. Mod+\ |
| Check list | `lexical.ts:set_block` | `BlockStyle.CHECK` → `INSERT_CHECK_LIST_COMMAND`. Theme classes `wr-check` (the `ul`), `wr-checked`, `wr-unchecked` (the `li`), styled in `document_css` so the editor and the PDF match: a box drawn by `::before`, a tick by `::after`, checked text struck and muted. Lexical toggles when a click lands within the `::before`'s width, 32 px further for touch; on a coarse pointer each item row is 44 px tall, so the target is at least 44 px both ways |
| Horizontal line | `lexical.ts:insert_rule` | `INSERT_HORIZONTAL_RULE_COMMAND`, which `$insertNodeToNearestRoot`s the node like a page break. `PageBreakNode.importDOM` claims `hr.page-break` at priority 1, so only other `<hr>`s become rules |
| Outline | `lexical.ts:outline`, `editor.svelte.ts:go_to` | The root's heading children (key, level, text), refreshed with `json` on every content change. A click scrolls the heading's element into view and puts the caret at its start; on the phone it closes the More sheet and doesn't focus, so the keyboard stays down |
| Spelling underline | `warren.app.svelte` | `::spelling-error` and `::grammar-error` on the page get a wavy underline in the paper's `--error` / `--info` (Brand Light, like the rest of the paper) |
| Undo after open | `lexical.ts:create_lexical` | Lexical's history can't undo the first change after a clear (it has no state to go back to), so `reset_history` sets the `HistoryExtension`'s `historyState.current` to the loaded state |

Formatting buttons cancel `pointerdown`, so the editor keeps focus and its selection on mouse and touch.

### Pictures

`image-node.ts`, `lexical.ts:insert_image`, `editor.svelte.ts:insert_pictures`, `$kit/utils/picture`. `ImageNode` is a block `DecoratorNode` (type `image`) whose four fields are flat NodeState (`createState` with `flat: true`), so the JSON is `{ "type": "image", "src", "width", "align", "alt" }` and a default value is left out:

| Field | Holds |
|-------|-------|
| `src` | A WebP data URL, at most 1600 px on the long edge, quality 0.82 (`PICTURE`, `$kit/utils/picture`, shared with Proposals). Only `data:image/png|jpeg|webp|gif` survives the model (`safe_image`); a pasted remote `<img>` is dropped, not fetched |
| `width` | Percent of the text column, 5–100 (`image_width`); a new picture gets its pixel width at 96 dpi over the column, capped at 100 |
| `align` | `left`, `center` (default) or `right` |
| `alt` | The description, for screen readers and Word |

Its DOM is `div.wr-image[data-align]` > `span.wr-image-frame` (width %) > `img` + `span.wr-image-handle`. With a fine pointer the selected picture shows the handle (bottom right, bottom left when right-aligned); dragging it sets the width live and commits on `lostpointercapture`. Touch uses the Picture group's presets (25, 50, 75, 100 %), also in the More sheet. Lexical ignores mutations inside a decorator, so the handle's DOM is safe. A click selects the picture (`NodeSelection`); Backspace and Delete remove it (rich text); the Picture group has width, alignment, description and Remove.

In: the Picture group's and the formatting bar's Insert picture menu (Take a photo on a phone through `pick_device_files({ capture })`, the device's chooser, or the OPFS picker), paste and drop (rich text's `DRAG_DROP_PASTE`). Each file is encoded, then put at the selection captured before encoding: at the very start of a block it goes before the block (Lexical's `$insertNodeToNearestRoot` would leave an empty copy of the block above), anywhere else through `$insertNodeToNearestRoot`. Once the pictures in the document pass 5 MB of data URL, a warning says saving and opening slow down (once per document opened).

### Page setup, headers and footers

`page.ts`, `sheets.ts`, `warren.app.svelte`. `geometry(page)` gives the printed width and height (landscape swaps them) and the margins: `page.margins` or the size's own (Normal: 20 mm, A5 15 mm). Presets Narrow (12.7 mm) and Wide (25.4 mm top and bottom, 50.8 mm sides) are Word's; Custom takes four numbers in mm or inches (app storage `units`), each 0–80 mm.

A header sits `zone_distance(top)` from the top edge (half the margin, at most 12.5 mm, Word's default); when it's taller than the margin leaves room for, the body starts below it after 4 mm, as Word does. The footer mirrors it. Page numbers aren't a setting of their own: the Page numbers select adds a `{page}` line to the header or footer with the chosen alignment (switching the zone on), and reads its state back from the first line that is only a page number (`is_page_number_line`: `{page}`, `Page {page}`, `{page} of {pages}`, `Page {page} / {pages}`). The Page number and Page count buttons type `{page}` and `{pages}` at the caret of the zone being edited. The tokens are plain text: the exports and the sheets fill them in.

On screen the paper is a size container, and every margin is `mm / page width × 100cqi`, so the page keeps its proportions at any window width; below a 40rem desk the side margins give way to `7cqi`. The paper holds the header zone, the body and the footer zone; a zone that's off is an empty spacer as tall as its margin. In Sheets flow each page break is a band: `--fill` (padding), a copy of the footer filled in for that sheet, the desk, a copy of the header for the next sheet. The copies are the live zone's `innerHTML` with the tokens replaced (`inert`), rebuilt when they change; Lexical doesn't police a decorator's children. So the first sheet shows the live header, the last the live footer, and the ones between show copies; numbers are sheet numbers, which differ from printed pages when a sheet runs past one page. `fill_sheets` subtracts the two zones' heights from the page height. Continuous flow shows the live header once at the top and the live footer once at the bottom, no copies.

### Templates

`templates.ts`, `templates/*.warren`, `warren-templates.svelte`. Four built-in templates are `.warren` files in the app, `import()`ed as raw text on use and read with `parse_document`: CV (one column: name, contact line, profile, experience, education, skills, references), Cover letter (name and contact in the header), Letter (both addresses, subject, sign-off), Report (header, `Page {page} of {pages}` footer, summary, findings, recommendations, next steps). They carry placeholders ("Your Name", "Company Name"), not lorem ipsum. File › New from template… asks to discard changes, then opens a window sheet listing Blank, the built-ins and every `.warren` in `/home/Templates` (Yours); the choice opens as an untitled document named after it, saved to `/home/Documents` by default. File › Save as template… saves the current document there through the save picker; the open file doesn't change. Two-column CVs wait for tables (wave C).

### Smart punctuation

`typography.ts` (pure), `lexical.ts:smart_typing`. An update listener in the root extension looks for one character typed at a caret: the caret's text node grew by exactly that character just before the caret, compared with the previous state. `smarten(text, offset)` then answers: `"` and `'` curl to “ ” ‘ ’ (opening at the start or after a space, bracket, dash or opening quote; otherwise closing, so "it's" gets an apostrophe), `--` becomes –, a third hyphen turns – into —, `...` becomes …. The replacement is a second update tagged `HISTORY_PUSH_TAG`: the history keeps the state with the straight character as its own entry, so one Undo gives back exactly what was typed. Skipped: updates tagged historic (undo and redo), history-push (Find, Change everywhere, its own replacement), paste, collaboration or `warren-load`; IME composition; text inside a link; a word before the caret that looks like a URL (`://`, `www.`, `mailto:`). Quotes are English-style whatever the language. On by default; Text › Smart quotes and dashes switches it (app storage `smart`, read on each keystroke through the getter `WarrenEditor` takes).

### Words

`words.ts`, pure. A word is `[\p{L}\p{N}]+` joined by `'`, `’` or `-`, so "don't" and "well-known" are one word each. Characters count spaces but not the line ends between blocks. Both counts come from `document_text(json)` (`model.ts`), the same walk the shell uses, so the app and `doc count` always agree.

- **Change everywhere** (`lexical.ts:change_everywhere`): `replace_all` with `WORD_MATCH`, so every text node goes through `replace_matches` (whole words, case-insensitive; an all-caps or capitalised occurrence gets the replacement in the same case), in one update tagged `HISTORY_PUSH_TAG`, so one Undo restores all of them. Selection points in changed nodes move with `map_offset`, so the selection stays on the new word. A word split across differently formatted runs ("**fa**st") isn't matched.
- **Find and replace** (`warren-find.svelte`, `lexical.ts:find_all` / `replace_match` / `replace_all`): Mod+F (a window shortcut; the browser's own find is bypassed) or Words › Find and replace opens a bar above the page. Matching is `find_matches` / `replace_matches` in `words.ts`, the same code Change everywhere runs with `WORD_MATCH` (whole words, keep case); Find uses substrings ignoring case, an optional Whole words toggle, and replaces literally. Matches are painted with the CSS Custom Highlight API (`::highlight()`, a name per bar instance), so the document isn't touched: each match's `Range` is built on the DOM text under `getElementByKey`. The current match starts at the selection (a writable `$derived` on the query and Whole words, so edits don't move it and stepping or replacing overrides it), Enter / Shift+Enter step and scroll it into view, Replace splices one match (`spliceText` without moving the selection, tagged `SKIP_DOM_SELECTION_TAG`, so focus stays in the bar) after checking the text there is still what was found, then steps past any matches inside the replacement to the next one, All is one undo step. Esc closes the bar and selects the current match; on the phone the nav bar's back closes it.
- **Stats**: reading time at 230 words a minute (`reading_minutes`, at least one minute once there's a word). With text selected, the status bar and the Words group show "N of total" words and characters, counted with the same `count` over `selection.getTextContent()`. The word goal is a number field in Words (empty is none, capped at 1,000,000); the status bar shows a bar and a percentage, green once it's reached. Setting it marks the document changed.
- **Used most** (`repeated_words`): words of four letters or more, not in an English stop-word list, used at least twice; the top eight. Clicking one selects its next occurrence after the selection, wrapping.
- **Synonyms**: shown only when `ai.features.prompt` isn't `no` (so never on mobile). `ai.extract` with `{ synonyms: string[] ≤ 8 }`; a chip fills the "Change to" field.

### Sheets

`sheets.ts`, `warren.app.svelte`. The paper is one `contenteditable`, so the sheets are drawn, not nested: in Sheets flow a page break is a band as wide as the paper (`margin-inline` minus the side margins) holding the footer, the desk and the next header (Page setup, above). CSS can't give a run of siblings a minimum height, so `fill_sheets` measures after each update and resize: each break gets `--fill` (its top padding) so the sheet before it, header and footer included, is at least one page tall, and the root gets `--tail` for the last sheet. Page height is the paper's width × height/width of the page size, so on a phone the sheet keeps the page's proportions. Sheets grow past a page; nothing is split automatically (ADR-059).

The paper is `min(page width, 100cqi − gutter)` wide with margins in proportion to it (Page setup, above), so text reflows on a narrow window instead of shrinking; the printed page uses the real size and margins. The paper takes Brand Light's tokens (scoped CSS variables), like Markdown to PDF's preview. Continuous flow drops the sheet chrome and shows a break as a labelled rule.

### Layout

At `@container (width >= 44rem)` the tools are a 15rem sidebar of `<details>` groups (Text, Paragraph, Picture, Page, Words, Export, Outline; open state in app storage `groups`). Below that the sidebar is hidden and a formatting bar sits above the page (bold, italic, underline, paragraph style select, bullets, numbers, Insert picture, More); the status bar says "Editing the header" or "footer" while a zone has focus; More opens the same groups in a bottom sheet (the Ask pattern) with a kit `Grabber`; Done, Back, Esc, the scrim or a swipe down (`swipe_dismiss`, once the list is at its top) close it. Spelling is the browser's own `spellcheck` underline.

### Export

The editor state is walked into blocks (`model.ts:blocks_of`): paragraph, heading (h4–h6 from paste count as h3), list item (kind `bullet`, `number` or `check`, level, list id, start, `checked`), rule and page break, each text block with its alignment (`align_of`: the element `format`, `null` when unset) and runs (bold, italic, underline, strike, `script` (`sub`, `super` or none, from format bits 32 and 64), size in pt, link URL — `safe_url` keeps only `http`, `https` and `mailto`; a `linebreak` is `\n`, a tab `\t`).

**.docx** (`docx.ts`), written into `write_zip` (deflate):

| Part | Holds |
|------|-------|
| `[Content_Types].xml`, `_rels/.rels`, `word/_rels/document.xml.rels` | The package wiring: document, styles, numbering, core properties |
| `word/document.xml` | One `w:p` per block; a picture is a paragraph with its `w:jc` and one run holding a `w:drawing` > `wp:inline` (`wp:extent` in EMU from the column width × width %, the height from the picture's aspect, `wp:docPr` with a package-wide id and the description, `a:blip r:embed` → `rIdImg{n}`); runs with `w:b`, `w:i`, `w:strike`, `w:sz` (half points), `w:u`, `w:vertAlign` (`subscript`, `superscript`), in the schema's `w:rPr` order; `\n` → `w:br`, `\t` → `w:tab`. A rule is an empty paragraph with a bottom border (`w:pBdr`). A check item is a plain paragraph (List Paragraph without numbering reads as an unknown style in mammoth) that starts with a ☐ or ☑ run, indented 0.5 in per level. Alignment is `w:jc` (`both` for justify), written in the schema's `w:pPr` order (style, page break, numbering, justification). Runs under one link sit in a `w:hyperlink` (`r:id` → an external relationship `rIdLink{n}`, one per URL) and carry the `Hyperlink` character style (underline). A page break becomes `w:pageBreakBefore` on the next paragraph (a trailing one, a `w:br w:type="page"`). `w:sectPr` with `w:headerReference` / `w:footerReference` (`rIdHeader`, `rIdFooter`) first, then `w:pgSz` (`w:orient="landscape"` when turned) and `w:pgMar` in twips, with `w:header` / `w:footer` at the zones' distances |
| `word/header1.xml`, `word/footer1.xml` | `w:hdr` / `w:ftr` with the zone's blocks written the same way; `{page}` and `{pages}` become `w:fldSimple` `PAGE` and `NUMPAGES` with the run's formatting. Each has its own `word/_rels/header1.xml.rels` when it holds links or pictures. Lists in a zone number on their own (list ids moved past the body's) |
| `word/media/image{n}.png` or `.jpeg` | Each distinct picture once (`docx-media.ts`, browser only): WebP isn't shown by Word before Microsoft 365, so it's redrawn on an `OffscreenCanvas` and written as PNG when any pixel is see-through (a logo), JPEG 0.9 otherwise. `[Content_Types].xml` gets a `Default` per extension and `Override`s for the header and footer |
| `word/styles.xml` | Defaults (the document font's name: Inter, Burrow or the file's name without extension; 11 pt, line 1.4, 6 pt after), `Normal`, `Heading1`–`3` (22 / 16 / 13 pt bold, keep with next, outline levels), `ListParagraph` |
| `word/numbering.xml` | Abstract 0 bullets (• ◦ ▪), abstract 1 numbers (decimal, lower letter, lower roman), nine levels at 0.5 in steps; one `w:num` per list with a `startOverride`, so each list restarts |
| `docProps/core.xml` | Title (the file name), creator "Warren", dates |

Characters XML can't hold (C0 controls) are dropped. Browser tests parse every part with `DOMParser`, check every `Override` and internal relationship target exists, every `r:embed` resolves in its part's rels, `w:sectPr`'s and `w:rPr`'s children are in the schema's order and `wp:inline` holds `extent`, `docPr`, `graphic`; a round trip through mammoth brings the picture and its description back. Not opened in Word or LibreOffice yet (neither is on the build machine).

**PDF** (`print.ts`, `print-layout.ts`): `printable` builds a standalone page for `print_html`. A picture is a `div.picture` with the alignment around an `<img>` at its width %; the page's CSP allows `img-src data:`.

Without a header or footer the body sits in the `@page` margins. With one, Chrome (checked at 153) prints page counters only inside `@page` margin boxes, which hold one styled string, not formatted runs or a logo next to text, and `position: running()` isn't supported. So the page has `@page { margin: 0 }`, the body's margins are padding on `.doc` repeated on every page by `box-decoration-break: clone`, and each page gets its own header and footer, absolutely placed at `index × page height + distance`, with `{page}` and `{pages}` filled in. That needs the page count and the zones' heights first: `measure_layout` loads the same page with `"measure"` into a hidden, page-wide iframe, reads the header's and footer's heights (which set the body's top and bottom padding, `zone_padding`), then lays the body out as page-tall columns (`columns`, `column-fill: auto`, breaks as `break-before: column`) and counts the fragments with `getClientRects()`. Chrome fragments columns the way it fragments printed pages; on eight random documents the count matched the printed PDF every time. A wrong count would show as a missing header on the last page or a blank extra page.

The rest: rules print as `<hr>`, check lists as `ul.wr-check` with the editor's classes (and the paper's `--background-lightest` for the tick), sub- and superscript as `<sub>` / `<sup>` with `line-height: 0` so lines keep their spacing. A body font is embedded as `@font-face` rules for `warren-body` with `data:` URLs (`fonts.ts:face_css`; the page's CSP allows only `data:` and `blob:` fonts besides its own), one per face, with each face's weight and style; links are `<a>` in Brand Light's primary. `@page { size: A4|letter|A5 portrait|landscape }` with the four margins (or `margin: 0`, above), Inter embedded with `@font-face`, Brand Light ink, and `div.break { break-before: page }`; an aligned block carries `style="text-align:…"`. `document_css(scope)` is shared with the editor, so heading sizes, list markers and spacing match what was typed. Rendered through Chromium's PDF printer, the sample is two Letter pages.

### Import

`docx-import.ts`, `lexical.ts:load_html`. A `.docx` goes through mammoth (`import()`ed on the first one opened, so it isn't in the app's chunk) to HTML, then `@lexical/html`'s `$generateNodesFromDOM` into a fresh editor. Style map on top of mammoth's defaults: `u => u` (mammoth ignores underline otherwise), `br[type='page'] => hr.page-break` (which `PageBreakNode.importDOM` turns into a page break), `Title` → h1, `Subtitle` → h2. Inline nodes left at the top level go into paragraphs; empty paragraphs are skipped (mammoth drops empty ones itself, so an empty one is what's left around a page break or a dropped picture).

What comes across: headings (h4–h6 as h3), bold, italic, underline, strikethrough, subscript, superscript, Warren's ☐/☑ check glyphs (as text, not a check list), line breaks, bullet and numbered lists with nesting, links, page-break characters. What doesn't: font sizes and fonts (mammoth drops them by design), alignment, horizontal lines (an empty bordered paragraph), `w:pageBreakBefore` (so Warren's own exported page breaks), picture sizes (they come in at their pixel width), table layout (cells become paragraphs), headers and footers, page setup. Pictures come through `convertImage`: each one's bytes are downscaled into a WebP data URL like a pasted picture; `lift_pictures` then moves each `<img>` out of its paragraph (a paragraph holding only a picture becomes it, keeping its alignment) before `ImageNode.importDOM` reads it. A picture the browser can't decode (EMF, WMF) is counted, tables found in the HTML and mammoth's warnings (unrecognised styles) counted, and any of those shows a warning toast naming what was left out.

In the app a `.docx` opens as an untitled document named after the file (`CV.docx` → `CV.warren`), not dirty; Save goes to Save as, starting in the `.docx`'s folder, or in `/home/Documents` when that's a system folder. There's no shell import: it needs the DOM.

Shared numbers are in `page.ts`: page sizes and margins (A4 and Letter 20 mm, A5 15 mm), body 11 pt, headings, line height, paragraph spacing.

## Data

`.warren`, JSON, zod-checked envelope (`format.ts`):

```json
{ "version": 4, "page": { "size": "A4", "flow": "sheets", "font": { "kind": "builtin", "id": "burrow" }, "orientation": "landscape", "margins": { "top": 25.4, "right": 50.8, "bottom": 25.4, "left": 50.8 } }, "goal": 500, "header": { "root": { "type": "root", "children": [] } }, "footer": { "root": { "type": "root", "children": [] } }, "editor": { "root": { "type": "root", "children": [] } } }
```

Version 4 added `image` nodes (`src`, `width`, `align`, `alt`), `page.orientation` (only `landscape` is written; portrait is its absence), `page.margins` (mm, 0–80 each; absent is the size's Normal) and `header` / `footer`, each a Lexical editor state like `editor`, present only while switched on. Versions 1–3 open as they are and are saved as version 4; a Warren before 4 refuses a version 4 file.

Version 3 added `goal` (optional positive integer up to 1,000,000, the word goal), `horizontalrule` nodes, check lists (`listType: "check"`, `checked` on list items) and the subscript and superscript format bits. Version 1 and 2 files open as they are and are saved as version 3; a Warren from before version 3 refuses a version 3 file ("made by a newer Warren").

Version 2 added `page.font` (optional; absent or `default` is Inter, and a `default` is dropped on read) and `link` nodes (`url`, `rel`, `target`, `title`) in the editor state. `font` is checked like Settings checks it: a `builtin` id must exist, a `file` name must be a plain font file name; whether the file is still in `/etc/fonts` is found out when it loads.

`size` is `A4`, `Letter` or `A5`; `flow` is `sheets` or `continuous`. `editor` is Lexical's own `SerializedEditorState`; the envelope checks only `root` and that each node has a `type`, and Lexical's `parseEditorState` rejects anything else when the app opens it. A file from a newer format version is refused with a message. Saves go wherever the user picks (`/home/Documents` by default); the window title is the file name, unsaved changes mark the window dirty and closing asks.

Props: `{ path }` (`FILE_PROPS`); `.warren` and `.docx` are associated, so `open x.warren` and a double-click open them. No other app lists `.docx`, so Warren is its only opener; a remembered default still wins.

Shell (`commands.ts`, `shell.ts`), both reading the JSON without Lexical:

| Command | Yields |
|---------|--------|
| `doc count <path>` | A `doc-count` value: name, words, characters; open → Warren. Reads versions 1–4 (rules and pictures add nothing, check items count their text; the header and footer aren't counted) |
| `doc export <path> --docx` | The `file` written beside it as `name.docx`, `name (1).docx` when taken; pictures, header, footer and page setup included |

Path completion is filtered to `.warren`.

## Dependencies & licences

`lexical`, `@lexical/extension`, `@lexical/rich-text`, `@lexical/list`, `@lexical/history`, `@lexical/selection`, `@lexical/utils`, `@lexical/html`, `@lexical/link` (which pulls in `@lexical/a11y`), all exactly 0.52.0, MIT, and `mammoth` 1.13.0 (BSD-2-Clause; brings `jszip`, `@xmldom/xmldom`, `lop`, `underscore`, `xmlbuilder`, `base64-js`, `dingbat-to-unicode`, and `argparse` for its CLI only), in the app's own `package.json` (ADR-045). mammoth loads only when a `.docx` is opened. The Lexical packages pull in `@lexical/clipboard`, `@lexical/dragon` and friends at the same version and `@preact/signals-core`. `@lexical/extension` brings `NestedEditorExtension` and the NodeState used by `ImageNode`; no new package. The templates and `docx-media.ts` are their own chunks, loaded on use. All but mammoth load with the app's lazy component: `warren.app` is 325 KB, 104 KB gz; mammoth is its own chunk, about 99 KB gz, fetched on the first `.docx` opened (production build, 2026-10-21). The boot chunk is unchanged.

## Limits

- No spelling list (Chrome's underline only), no PDF import, no `.doc`.
- A `.docx` loses fonts and font sizes, alignment, picture sizes, table layout (the cells' text is kept as paragraphs), headers and footers, and paragraph-property page breaks on import.
- The .docx names the document font; Word without it substitutes one, so line breaks can differ (exporting with a font other than Inter warns about it). A font file's name stands in for its family name.
- Links in the .docx are underlined, not coloured.
- On a narrow window lines reflow differently from the printed page.
- A Lexical upgrade that changes node JSON needs a migration under the envelope's `version`.
- Change everywhere and Find see text inside one text run only ("**fa**st" isn't found as "fast"). Used most counts across runs, so it can list a split word that clicking it then doesn't select.
- Stop words are English, and so are smart quotes (“ ” ‘ ’ in every language).
- A horizontal line doesn't survive a .docx import; check items come back as text starting with ☐ or ☑.
- The themed spelling underline isn't checked in automation: headless Chromium has no spellchecker.
- Synonyms untested against the real model (no Gemini Nano on the build machine).
- Pictures are blocks: no text beside a picture (a logo next to a name needs tables, wave C), no cropping or rotation.
- Page fields show sheet numbers on screen; a sheet that runs past a page makes them differ from the PDF's. In the live header (first sheet) and footer (last sheet) they show as `{page}` / `{pages}`, the copies between sheets show numbers and can't be clicked into.
- One header and one footer for every page: no different first page, no odd and even.
- The PDF's per-page header and footer rest on the measured page count (see Export).
- Only one picture is checked against the mammoth round trip; a real Word or LibreOffice open of the .docx (pictures, header, footer, fields) is still unverified.

## Decisions

- [Brainstorm, 2026-10-21](../brainstorm/2026-10-21_warren.md)
- [ADR-059](../adrs/059-warren.md)
