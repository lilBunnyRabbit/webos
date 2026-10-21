# ADR-058: Proposals
**Date:** 2026-10-21
**Status:** Implemented

## Context
LaxDOTexe keeps app ideas as loose notes and wants them organised, with pictures inside the text, in one file he can send on Discord for the owner to open. No WebOS app mixes text and images in one document. Discussion: [brainstorm](../brainstorm/2026-10-21_proposals.md).

## Decision
A new user app, **Proposals** (`proposals`). It is a notebook of app proposals shaped like the app-spec guide.

- **Model.**
  ```ts
  const ProposalStatus = { DRAFT: "draft", SENT: "sent", SHIPPED: "shipped" } as const;
  const SECTION_IDS = ["problem", "does", "picture", "files", "example", "scope", "phone", "feel"] as const;
  interface Proposal { id: string; title: string; status: ProposalStatus; sections: Partial<Record<SectionId, Content>> }
  type Content = Run[];  // a paragraph-aware run list
  type Run = { text: string } | { image: string; display: "inline" | "block" }; // image = WebP data URL
  ```
  The section labels and guide questions are Problem, What it does, Picture, Files, Real example, First vs later, Phone, and Feel and name. All are optional; empty ones are not written.
- **File.** Markdown `.proposals.md` with a version marker, opened through a file association:
  ```markdown
  <!-- proposals: 1 -->
  # Proposals

  ## Pew Pew 2
  <!-- status: draft -->

  ### Problem
  The cursor is boring ![](data:image/webp;base64,…) and static.

  ![block](data:image/webp;base64,…)
  ```
  - Inline images use `![](…)` within a line. A block image is `![block](…)` alone on its line.
  - Images are downscaled to at most 1200 px on the long edge, WebP.
  - The parser is hand-written and round-trip tested. It tolerates hand edits; unknown `###` headings go into the nearest known section rather than being dropped.
- **Editor.** Each section is a `contenteditable` region with inline `<img>` elements. Tapping an image toggles inline and block. Images come in by paste or drop at the caret, the OS file picker, the camera on mobile, or a small sketch pad (pen, eraser, undo) that inserts a WebP.
- **List.** A sidebar of proposals with status chips (draft, sent, shipped), a status filter and a fill meter (n/8). It stacks on narrow containers.
- **Send.** The whole notebook, or one proposal as its own `.proposals.md`. It uses `navigator.share({ files })` when `navigator.canShare` accepts the file, and otherwise saves to the device.
- **Shell.** `open` through the association only.

## Alternatives Considered
- **A generic rich-document app:** no guided structure.
- **Image paste in Text Editor:** no list or structure.
- **A Forms template:** no images.
- **JSON with data URIs:** not human-readable.
- **A zip bundle:** opaque in Discord, and needs zip read and write.
- **One file per proposal:** no list or status view.
- **Kind-specific sections (app, feature, bug):** deferred.

## Consequences
- Files grow with images (base64 adds 33 %); downscaling keeps a screenshot near 100 KB.
- Inline images in `contenteditable` need careful caret, delete and paste handling, especially on mobile.
- The agent can read a received file directly, so proposals feed the app-request flow without conversion.

## Revision 2026-10-21 (implementation)

Built as decided. Choices made inside the decision:

- **Model.** `Notebook { title, proposals }` holds the file's `#` heading. `Proposal.id` is a session-only `crypto.randomUUID()`, not written to the file. Runs are interfaces (`TextRun | ImageRun`). A block image's line breaks on either side are implicit in the file, so a run list round-trips exactly after `normalize_content`.
- **Escaping.** Text writes `\` as `\\` where it could be read as an escape, every `![` as `\![`, and a line starting with `#` or `<!--` with a leading `\`. The parser reads `\` plus one of `\ ! # <` as that character and leaves other backslashes alone. Only `data:image/…;base64,` URLs are images; any image MIME is accepted on read.
- **Editor.** `contenteditable="plaintext-only"` with `white-space: pre-wrap`. Pictures toggle by click or tap only.
- **Sketch pad.** 1200 × 900, or 900 × 1200 when the stage is portrait. The paper (`--background`) is painted into the picture along with the ink (`--foreground`), so a sketch made in a dark theme stays readable in a light one.
- **Send fallback.** Saving to the device is Backup's `save_to_device` with the anchor download, imported on demand; no save picker.
- **Narrow layout.** "Stacks" is a two-pane switch (list; editor with a back arrow and the phone's Back), the pattern Font Maker uses, rather than the list above the editor.
- **Camera input.** `pick_device_files({ capture: "environment" })`. Owner, 2026-10-21: the option went into core instead of keeping two copies of the helper.

Internals: [docs/apps/proposals.md](../apps/proposals.md).
