# Proposals
**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
LaxDOTexe: "I have wrote a couple ideas down but i want to make it more organised. If you include a spreadsheet on WebOS that allows pictures to be placed inside words, that would help me a bunch. If I can then send you the file on Discord and you open it, will that work?"

Owner: a spreadsheet is not the way; a custom app is. Unsure whether to generalize it.

What exists today:
- No app mixes text and images in one document. Text Editor is plain text or Markdown, and Quick Notes holds text only.
- Forms (`forms/form.ts`) is a Markdown-based file format (`.form.md`), with no images.
- Font Maker keeps images inside its file as WebP data URLs (`font-maker/format.ts:17`).
- Opening a received file already works through Open from Device (ADR-031).

## Topics discussed

### Generic or specific (decided)
A dedicated app shaped like a pitch, not a generic rich-document app. The structure is the point: it follows the app-spec guide, so ideas arrive already answering the grill's questions. Rejected:
- a generic notebook (no guided fields, so "organised" depends on discipline);
- image paste in Text Editor (no list, no structure);
- a Forms template (Forms has no images).

### Format (decided)
Markdown, `.proposals.md` (the Forms `.form.md` pattern). Images are embedded as `![](data:image/webp;base64,…)`, downscaled. One file, readable in any editor and by the app-request skill as-is. Rejected:
- JSON with data URIs (not human-readable);
- a zip bundle (opaque in Discord; needs zip read and write).

Known cost: base64 adds 33 % to the size.

### File scope (decided)
Many proposals per file. A sidebar lists them, and Lax sends the whole notebook. Cost: the file grows with every screenshot.

### Sections (decided)
The 8 fixed sections from the guide, all optional: Problem, What it does, Picture, Files, Real example, First vs later, Phone, Feel and name. Each shows its guide question as a placeholder. Empty sections are left out of the file. A fill meter shows how many are filled (3/8).

### Status (decided)
draft → sent → shipped, shown as a chip on each list row, with a filter. Status lives in whichever copy of the file you hold.

### Images in text (decided)
Both inline and block. Small images flow inside a sentence at about two line heights. Tapping one switches it to full width (a block), and tapping again switches it back. This is the hardest editing case (caret, delete and paste around images, especially on mobile), accepted on purpose.

### Image input (decided)
- Paste and drop at the caret.
- A picker button (OS file picker).
- Camera on mobile.
- A small sketch pad (pen, eraser, undo) that inserts the drawing as an image.

### Sending (decided)
A Send button with two choices: the whole notebook, or this proposal only (as its own `.proposals.md`). It uses `navigator.share` with the file where it can (phone → Discord); otherwise it saves to the device.

### Shell (decided)
`open` through the association only; no commands.

### Name (decided)
**Proposals** (`proposals`).

## Key takeaways
- The pitch structure is the feature; images inside the text are the reason it's an app and not a form.
- Markdown with data-URI images keeps it one file that both people and the agent can read.

## Action items
- [x] ADR-058 Proposals.
- [x] Build in a worktree agent: the app, `docs/apps/proposals.md`, a changelog line, the ROADMAP line "idea from LaxDOTexe".

## Next session topics
- Kinds (app, feature, bug) with their own sections.
- Status coming back to Lax (owner marks shipped, sends back).
- A generic notebook, if a second use shows up.
