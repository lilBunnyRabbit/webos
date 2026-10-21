# App internals

Pages for user apps (`src/lib/apps/user/`) whose insides aren't obvious from the UI: an algorithm, a model, a wire protocol, a file or share format. The [system reference](../system/README.md) covers the OS and leaves user apps out; this folder covers the few that need explaining.

An app that's a form over a JSON file doesn't get a page. An app that ships a model, parses a binary format, talks to another device or invents a payload does.

## Keeping it current

- A change under `src/lib/apps/user/{id}/` for an app in the index below updates `docs/apps/{id}.md` in the same commit. A commit that leaves the page stale is incomplete.
- A change to kit code a page describes (`$kit/utils/p2p`, `$kit/utils/light`, `$kit/utils/codecs`, `$kit/utils/qr`, `$kit/utils/video`) updates that page too.
- A new or changed app that gains a model, algorithm, protocol, file or share format, or a non-trivial dependency gets a page, a row in the index below and a row in the "Per-app docs" table in `CLAUDE.md`.
- Numbers are measured, with what they were measured on. A number nobody measured isn't written down; say it's unmeasured under **Limits**.

## Index

| Page | App | Covers |
|------|-----|--------|
| [shopping-list.md](shopping-list.md) | Shopping List (`shopping-list`) | PP-OCRv5 photo reading on ONNX Runtime, word snapping, live WebRTC sync and merge, quantity parsing, suggestions |
| [cards.md](cards.md) | Cards (`cards`) | Barcode formats and check digits, bwip-js drawn as one SVG path, scanning, the `WEBOS-CARDS:1:` share payload, `Cards.zip`, props |
| [p2p-transfer.md](p2p-transfer.md) | P2P Transfer (`p2p-transfer`) | QR signalling (SDP packed into Base45, `$kit/utils/p2p`), the file transfer protocol, resume; By light: LT fountain code over animated QR (`$kit/utils/light`) |
| [font-maker.md](font-maker.md) | Font Maker (`font-maker`) | Stroke expansion to quadratic contours, the hand-written TrueType writer, `.fontmaker`, template corner marks, homography and scan guides |
| [format-lab.md](format-lab.md) | Format Lab (`format-lab`) | jSquash codecs in a worker pool (`$kit/utils/codecs`), SSIM and the heatmap, AVIF and JPEG XL headers, `convert` |
| [birdseye.md](birdseye.md) | Birdseye (`birdseye`) | NCC template tracking over a pyramid, lost frames and re-boxing, forward-backward smoothing, the locked render, WebM export through `$kit/utils/video` |
| [proposals.md](proposals.md) | Proposals (`proposals`) | The run model (text and inline/block images), `.proposals.md` with escaping and hand-edit tolerance, the `contenteditable` editor, 1200 px WebP pictures, the sketch pad, Send |
| [warren.md](warren.md) | Warren (`warren`) | Lexical used without a framework, the page-break node and measured sheets, Change everywhere in one undo step, `.warren`, the hand-written .docx (styles, numbering, page size) and the print page |
| [unsaid.md](unsaid.md) | Unsaid (`unsaid`) | The card deck and seeded deals, the banned-word check (folding, cheap stems, 4-letter prefixes), the guess prompt and its schema, hits and scoring |

## Page shape

Same sections, same order, so the same thing is always in the same place:

```
# {Name}
Id `x` · Source: `src/lib/apps/user/{id}/` · ADRs and brainstorms in one line
## What it does             who it's for, one short paragraph
## How it works             pipeline and algorithms, a subsection each: why this over the alternatives, measured numbers
## Data                     persistence paths, formats, props
## Dependencies & licences
## Limits                   known errors, untested areas, unmeasured numbers
## Decisions                links to the brainstorm logs and ADRs
```

- Cite code as `file.ts:line`, relative to the app folder, or `kit/utils/…` from `src/lib/` for kit code. Line numbers drift; fix them when you touch the page.
- Tables for anything with more than two parallel facts.
- Same voice as `docs/system`: direct, what the code does today. Why it was chosen goes here; how the decision was reached stays in the brainstorm.
- No personal data: a measurement may name the test photo or file, not what's in it.
