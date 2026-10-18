# Forms: answer codes

**Date:** 2026-10-18
**Participants:** owner, Claude

## Context

A respondent presses "Create answer link" and gets a URL with the whole form and their answers. The owner opens it, Forms shows the incoming answer, and the owner picks an `.answers` file by hand. Nothing ties an answer to the owner's form file except the file name the link carries. Owner: "I shouldn't get the answer link that way, more like an answer input where I paste it in the Forms app or CLI and it finds the correct form and stores the results, and then I have an overview of the results."

Related: [solo app open](2026-10-18_isolated-app-open.md) (a shared form now opens solo).

## Decisions

- **Respondent gets an answer code**, not a link: the `v1…` text in a box with Copy, "Send this code back". The paste box also takes an old answer link and pulls out `a=`.
- **A form id lives in the file.** Sharing stamps `<!-- form: {id} -->` as the first line of the `.form.md` once. Share and answer codes carry it; a paste scans `/home` for the form with that id. Survives edits, renames and moves. The answer code drops the form source, so it's much shorter. Answers stay keyed by question label (as the answers file already is), so reordering or editing questions after sharing doesn't mislabel anything. A form shared before ids existed: match by name, else the old incoming flow.
- **Paste and shell, saved straight away.** Forms: an "Add answer" box at the top of Answers, and pasting a code anywhere in a Forms window (outside text fields). Shell: `form answer <code>` saves it and prints where. Both write into `{form}.answers` beside the form; a duplicate is skipped and the toast says so. Forms then shows that form's Answers.
- **Overview: both.** A Summary tab in Answers (per question: a tick bar for checkboxes, text answers listed with who wrote them) and a forms home when Forms opens with nothing: every form in `/home` with its answer count and latest answer.
- Rejected: matching by name plus a source hash (breaks on rename and on edits), a registry file in `/var/lib` (stale after a move), a confirm step before saving.

## Action items

- [x] Form id in the parser and on share (Share saves the form first; `form link` stamps the file)
- [x] Answer code payload + paste box + Forms-wide paste
- [x] `form answer <code>`
- [x] Summary tab, forms home

## Key takeaways

- The id goes in the source, so a shared form's source already carries it to the respondent: no separate field in the share code.
- Answers in a code stay keyed by question label, like the answers file, so editing the form after sharing can't mislabel them.
