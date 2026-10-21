# Proposals

Id `proposals` · Source: `src/lib/apps/user/proposals/` · [brainstorm](../brainstorm/2026-10-21_proposals.md) · [ADR-058](../adrs/058-proposals.md)

## What it does

A notebook of app proposals shaped like the app-request pitch: each proposal has a title, a status (draft, sent, shipped) and eight optional sections (Problem, What it does, Picture, Files, Real example, First vs later, Phone, Feel and name), each showing its guide question until it's filled. Pictures sit inside the sentences, small and inline or full width. The whole notebook, or one proposal, goes out as one Markdown file that a person or the app-request agent reads as is. Idea from LaxDOTexe.

## How it works

### Model

`model.ts`. A `Notebook` is a title plus `Proposal[]`. A proposal's `sections` is a partial record of `Content`, which is a flat run list:

| Run | Shape | Meaning |
|-----|-------|---------|
| Text | `{ text }` | Carries its own `\n` line breaks; a paragraph break is `\n\n` |
| Image | `{ image, display }` | `image` is a data URL (WebP for everything the app makes); `display` is `inline` (about two line heights, in the sentence) or `block` (full width, a line of its own) |

`normalize_content` (`model.ts:74`) is the canonical form every reader produces: adjacent text merged, empty text dropped, whitespace trimmed at both ends. A section is filled when it has an image or non-blank text (`is_empty`, `filled_count`); the list and the editor show it as a meter of eight bars and `n/8`.

A proposal's `id` is a `crypto.randomUUID()` made on parse or creation, used to key the list; it is not written to the file. Edits are immutable (`update_proposal` keeps identity when nothing changed), so `NotebookDocument` (`notebook.svelte.ts`) is dirty exactly when its notebook isn't the saved reference.

### File format

`format.ts`. `.proposals.md`, Markdown, a compound extension so every other `.md` stays with Text Editor ([file associations](../system/apps/file-associations.md)).

```markdown
<!-- proposals: 1 -->
# Proposals

## Pew Pew 2
<!-- status: draft -->

### Problem
The cursor is boring ![](data:image/webp;base64,…) and static.
![block](data:image/webp;base64,…)
```

- Line 1 is the version marker; a higher number is refused ("made by a newer Proposals"), a missing one is accepted for hand-written files.
- `#` is the notebook title, `##` a proposal, `<!-- status: … -->` its status, `###` a section by its label. Sections are written in the fixed order, empty ones left out.
- An inline image is `![](data:…)` inside a line. A block image is `![block](data:…)` alone on its line; the line breaks on either side of it are implicit, so `[text "a", block, text "b"]` writes as `a\n![block](…)\nb` and reads back the same (`serialize_content`, `format.ts:100`; `parse_content`, `format.ts:77`).
- Text is escaped so it can't turn into structure: `\` before `\ ! # <` and at the end of a run becomes `\\`, every `![` becomes `\![`, and a line starting with `#` or `<!--` gets a leading `\` (`escape_piece`, `format.ts:94`). The reader (`parse_line`, `format.ts:48`) scans left to right: `\` plus one of `\ ! # <` is that character, `![alt](data:image/…;base64,…)` is an image, anything else is text. A backslash before anything else stays, so `C:\path` survives a hand edit.

Hand edits are tolerated rather than rejected (`parse_notebook`, `format.ts:162`):

| Input | Read as |
|-------|---------|
| CRLF line ends | LF |
| `### Mood board` (unknown label) | The line `Mood board` in the section it sits in; before any known section it joins the next one |
| Text after `##` and before the first `###` | The next known section, or Problem if none follows |
| Text before the first `##` | A proposal titled "Untitled proposal" |
| The same `###` twice | Appended to the first, after a blank line |
| Labels: case, punctuation, `First version vs later`, `feel & name`, section ids | Matched loosely (`section_of`, `format.ts:44`) |
| `<!-- status: SHIPPED -->`, unknown statuses | Lowercased; unknown stays draft |
| `![x](data:image/png;base64,…)` | An inline image, any image MIME |
| `![](https://…)` | Text: only data URLs are images |

Round trips are tested on fixed cases and 500 random run lists (`format.test.ts`), and through the DOM in Chromium (`editor-dom.browser.test.ts`).

### Editor

Each section is a `contenteditable="plaintext-only"` div with `white-space: pre-wrap` (`section-editor.svelte`), on the kit's `field` recipe. `plaintext-only` makes Enter insert a line break and a text paste arrive as plain text, so the DOM stays text nodes plus `<img>`; `read_runs` (`editor-dom.ts:24`) still reads `<br>` and Chrome's `<div>` line wrappers as `\n` in case one slips in.

- **DOM is the source while typing.** Every `input` reads the runs and hands them up; the component remembers the array it emitted and re-renders from the model only when `content` is some other array (load, switching proposals), so the caret never jumps.
- **Caret.** A `selectionchange` listener keeps the last range inside the section, so the picture menu inserts where the caret was even after the tap moved focus to the button. With no range the picture goes at the end.
- **Images in.** Paste (`image_files(clipboardData)`) and drop (at `caretPositionFromPoint`) in the section; the section's picture button opens a menu: Take a photo (mobile, `pick_device_files({ capture: "environment" })`), Choose a picture / From this device… (`pick_device_files`), From files… (the window's file picker, several at once) and Sketch…. `insert_image` (`editor-dom.ts:51`) puts the `<img>` at the range and the caret after it.
- **Toggle.** A click or tap on a picture flips `data-display`; CSS does the rest (`height: 2lh` inline, `display: block; max-height: 28rem` block). Deleting a picture is Backspace or Delete like a character.
- The guide question is an `aria-placeholder` and an overlay span shown while the section is empty.

### Image pipeline

`image.ts`. Every picture goes through `picture_data_url`: decoded through `<img>` (so SVG works), drawn on an `OffscreenCanvas` at `fit_size` (long edge at most 1200 px, never upscaled), encoded as WebP at quality 0.8 and read back as a data URL. Animated GIFs keep their first frame. Conversion runs inline, not as a task: one picture takes well under a second.

### Sketch pad

`sketch-pad.svelte`, `sketch.ts`. An overlay over the whole app: a canvas of 1200 × 900, or 900 × 1200 when the stage is taller than wide (picked once when it opens, so the picture fits a phone held upright). Pen (6 px) and eraser (40 px) strokes are point lists; Undo drops the last one. Every redraw reads `--foreground` (ink) and `--background` (paper) from the canvas's computed style, so the sketch uses the current theme's tokens, and the paper is painted into the picture so it reads the same in any theme later. A pen's eraser end (button 5) erases. Strokes end on `lostpointercapture`. Insert encodes WebP at 0.85.

### Send

`io.ts:32`. Serializes the notebook (or `only(notebook, id)` for one proposal, named after its title) as a `text/markdown` `File`. When `navigator.canShare({ files })` accepts it, `navigator.share` opens the share sheet (phone to Discord); a cancel is silent. Otherwise, or when sharing fails, it downloads through Backup's `save_to_device` (anchor download, imported on demand), and a toast names the file. Send never touches the saved file or the statuses.

### Layout

One container query on the app root (`container: proposals`): from 44rem the list (17rem) and the editor sit side by side; below it they're two panes, the editor with a back arrow and the phone's Back going to the list. The editor pane is deliberately not a container itself: with it as an `@container`, Chrome kept the back arrow's `display` from the narrow query after the pane had been `display: none` and the window was widened again.

## Data

- Files: `.proposals.md` anywhere, opened through the association, `FILE_PROPS` (`{ path }`), Open…, Save (Mod+S), Save as… (Mod+Shift+S), New notebook. A new notebook starts with one empty proposal and isn't dirty until edited.
- No app storage, no settings.
- Shell: none; `open` reaches it through the association.

## Dependencies & licences

None beyond the platform: `contenteditable="plaintext-only"`, `OffscreenCanvas.convertToBlob` (WebP), `caretPositionFromPoint`, Web Share Level 2.

## Limits

- Only data-URL images are pictures; a hand-written link to a web image stays text and is escaped on the next save.
- Pictures toggle by pointer only; the keyboard can delete them but not switch inline and block.
- `contenteditable` undo is the browser's own: it covers typing, not inserted pictures or toggles.
- File size with real screenshots is unmeasured; base64 adds a third to every picture.
- `navigator.canShare` for a `.md` file is untested on real phones; if Android refuses the type the file is downloaded instead.
- Text formatting (bold, lists, links) is not modelled; Markdown typed into a section is kept as plain text.

## Decisions

- [Brainstorm 2026-10-21](../brainstorm/2026-10-21_proposals.md): dedicated app over a generic notebook, Markdown with data-URL images, many proposals per file, the eight sections, inline and block images, Send.
- [ADR-058](../adrs/058-proposals.md): the model, the format, the editor and Send.
