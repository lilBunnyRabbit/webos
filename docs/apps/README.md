# App internals

Pages for user apps (`src/lib/apps/user/`) whose insides aren't obvious from the UI: an algorithm, a model, a wire protocol, a file or share format. The [system reference](../system/README.md) covers the OS and leaves user apps out; this folder covers the few that need explaining.

An app that's a form over a JSON file doesn't get a page. An app that ships a model, parses a binary format, talks to another device or invents a payload does.

## Keeping it current

- A change under `src/lib/apps/user/{id}/` for an app in the index below updates `docs/apps/{id}.md` in the same commit. A commit that leaves the page stale is incomplete.
- A change to kit code a page describes (`$kit/utils/p2p`, `$kit/utils/light`, `$kit/utils/codecs`, `$kit/utils/qr`, `$kit/utils/video`, `$kit/utils/perspective`) updates that page too.
- A new or changed app that gains a model, algorithm, protocol, file or share format, or a non-trivial dependency gets a page, a row in the index below and a row in the "Per-app docs" table in `CLAUDE.md`.
- Numbers are measured, with what they were measured on. A number nobody measured isn't written down; say it's unmeasured under **Limits**.

## Index

| Page | App | Covers |
|------|-----|--------|
| [shopping-list.md](shopping-list.md) | Shopping List (`shopping-list`) | PP-OCRv5 photo reading on ONNX Runtime, word snapping, live WebRTC sync and merge, quantity parsing, suggestions |
| [cards.md](cards.md) | Cards (`cards`) | Barcode formats and check digits, bwip-js drawn as one SVG path, scanning, the `WEBOS-CARDS:1:` share payload, `Cards.zip`, props |
| [p2p-transfer.md](p2p-transfer.md) | P2P Transfer (`p2p-transfer`) | QR signalling (SDP packed into Base45, `$kit/utils/p2p`), the file transfer protocol, resume; By light: LT fountain code over animated QR (`$kit/utils/light`) |
| [font-maker.md](font-maker.md) | Font Maker (`font-maker`) | Stroke expansion to quadratic contours, the hand-written TrueType writer, auto kerning from side profiles, `.fontmaker`, template corner marks, homography and scan guides |
| [format-lab.md](format-lab.md) | Format Lab (`format-lab`) | jSquash codecs in a worker pool (`$kit/utils/codecs`), SSIM and the heatmap, AVIF and JPEG XL headers, `convert` |
| [birdseye.md](birdseye.md) | Birdseye (`birdseye`) | NCC template tracking over a pyramid, lost frames and re-boxing, forward-backward smoothing, the locked render, WebM export through `$kit/utils/video` |
| [proposals.md](proposals.md) | Proposals (`proposals`) | The run model (text and inline/block images), `.proposals.md` with escaping and hand-edit tolerance, the `contenteditable` editor, 1200 px WebP pictures, the sketch pad, Send |
| [warren.md](warren.md) | Warren (`warren`) | Lexical used without a framework, the page-break node and measured sheets, Change everywhere in one undo step, find and replace (Custom Highlight API), links, `.warren` v4 with a per-document body font, pictures, page setup, headers and footers, templates, the hand-written .docx export (styles, numbering, pictures, header and footer parts, page fields) and `.docx` import through mammoth, the print page with per-page headers and footers from a measured page count |
| [unsaid.md](unsaid.md) | Unsaid (`unsaid`) | The card deck and seeded deals, the banned-word check (folding, cheap stems, 4-letter prefixes), the guess prompt and its schema, hits and scoring |
| [alibi.md](alibi.md) | Alibi (`alibi`) | The seeded case generator (templates, beats, the flipped statement, evidence cards), the suspect sheet sent to the model and what it never sees, judging and score, the save |
| [doodlehop.md](doodlehop.md) | Doodlehop (`doodlehop`) | When a guess is asked (stroke end, idle, one in flight, merged strokes), the cropped black-on-white PNG snapshot, the `extract()` call with a word-list enum, matching and scoring in code |
| [calendar.md](calendar.md) | Calendar (`calendar`) | Repeat rules and their occurrences (month-end clamping, 29 February, skip, until), how a reminder becomes a scheduler job (the day shift, the exactness check, `on_fire`), the events file |
| [hutches.md](hutches.md) | Hutches (`hutches`) | The generator (king-separated rabbits, grown meadows, reshaping until one answer and logic reach it), `count_solutions`, the deduction rules behind Hint, input and auto-cross |
| [soundboard.md](soundboard.md) | Soundboard (`soundboard`) | The shared player and play modes, edited time → source time across cuts and crossfades (`timeline.ts`), reading a video's sound (decode, then the record task; 10 min confirm, 1 h refusal), WAV encoding, the board file, pad colour and picture, the trim editor |
| [sun-and-moon.md](sun-and-moon.md) | Sun & Moon (`sun-and-moon`) | The rules, the line-pattern solver and why it proves uniqueness, the generator (givens first down to one per row, then signs), the five hint rules |
| [hop.md](hop.md) | Hop (`hop`) | The random path by backbite moves, walls cut from unused edges, the dotted-path counter and its pruning, cutting other answers then removing dots under a search budget, the hint that runs through forced cells |
| [tunnels.md](tunnels.md) | Tunnels (`tunnels`) | The Wend-style generator (snake carve, word fill), the uniqueness proof (trie tracing plus exact cover over the full accept list), the drag path model, hints, Letterer's word lists |
| [plots.md](plots.md) | Plots (`plots`) | The random rectangle partition, the exact-cover solver (candidate plots per clue, fewest-options cell first), the two deduction rules and their fixpoint, thinning clues while the rules still solve it, the hint, drag and keyboard input |
| [image-tools.md](image-tools.md) | Image Tools (`image-tools`) | The fit search (quality by binary search, then scaling by √(limit / size)), decimal limits, Keep's target format, Convert's one task with a sub-task per format and its warnings, the formats written through the kit encoder table, `image fit`, `image convert-all` and `squash --under` |
| [checkout-challenge.md](checkout-challenge.md) | Checkout Challenge (`checkout-challenge`) | The career run and its pure reducer: phases (warm-up, typed list, restock), customers' trust and returns, party orders, police and blind mode, jail, staff, the books, difficulty by day, stars, the saved run, keys and focus |
| [tea-timer.md](tea-timer.md) | Tea Timer (`tea-timer`) | The tea model (built-ins, overrides, hidden, custom), the strength mapping, steeps and their extra time, °C storage with the °F editor, one scheduler job per cup and the brew state rule, the `teas.json` format |
| [tape-sketch.md](tape-sketch.md) | Tape Sketch (`tape-sketch`) | `.tapesketch` v3 (lengths in mm, not coordinates; a magnet angle set per sketch; v2 heights become marker notes, v1 boxes are left out), the closure check per axis and the implied length, Check lengths off for shapes that aren't flat, the rebuild from lengths (compass rule, unmeasured edges take the slack) behind area and Redraw to scale, snap sets closed under +180° and the direction ring, two-finger rotate folded into the screen mapping so labels stay upright, the walk scale, greedy label placement off every line |
| [four-walls.md](four-walls.md) | Four Walls (`four-walls`) | The four triangular zones and the pinwheel diagonals, piece frames (`to_board`, `to_frame`), spawn and lock out, zone lines and the collapse, the Cycle and Random walls and the seeded daily, controls by frame, the board size playtest, best scores and achievements |
| [color-tools.md](color-tools.md) | Color Tools (`color-tools`) | The chromatics wrappers other apps import (`color.ts`, `models.ts`), the current colour as a model string, the display chain (gamut map, then hex), contrast with translucent text, CVD, harmonies in a chosen hue space, the picture and camera sampler with its loupe, `.palette` v1 |
| [colour-atlas.md](colour-atlas.md) | Colour Atlas (`colour-atlas`) | The model table (tier, family, source), slider ranges from `Model.channels` with the sRGB extent where a range is a format ceiling, target redraws for unreachable or throwing conversions, the 2/2/1 seeded run, ΔE2000 scoring, the dex |
| [portfolio.md](portfolio.md) | Portfolio (`portfolio`) | Content as typed records with ok/draft status and the guard test, the terminal session and its tour, the rail layout (`compose`, the View Transition re-tile), evidence and `shows`, the engagements rule, the WebGL2 particle engine, Contact's `mailto:`, props and shell, links that work in full and solo mode |
| [moonrabbit.md](moonrabbit.md) | Moonrabbit (`moonrabbit`) | The encrypted journal format (`journal.json`, `index.bin`, one AES-GCM blob per entry and photo, additional data), the key hierarchy (data key wrapped by PBKDF2 phrase key and HKDF recovery code, X25519 inbox key), per-device quick unlock (passkey PRF, Carrot patch, PIN, device key in IndexedDB, 5 tries, 7 days, restore stamp), locking, the locked inbox (ephemeral X25519, merge on unlock), mood stats and views, the live-formatting editor, the threat model |
| [doc-scan.md](doc-scan.md) | Doc Scan (`doc-scan`) | Finding the paper (Otsu, the biggest bright region, corners from x ± y extremes), the homography warp in a worker, the Gray and B&W filters, the PDF page size, the `doc-scan::scan` sheet |
| [tight-spot.md](tight-spot.md) | Tight Spot (`tight-spot`) | The kinematic Ackermann model and its fixed step, five vehicles and the one-trailer model with jackknife, SAT collision and the contact point, the seeded chunk grid and plans, the fourteen lot layouts sized to the vehicle, the solvability planner and the trailer replay, judging, moves and stars, sensors, controls |
| [motion-watch.md](motion-watch.md) | Motion Watch (`motion-watch`) | Main thread, worker and storage split, running-average detection with blobs, lights and zones, the WebCodecs pre-roll ring and clip cutting, the day folder and `events.json` format, retention, the window as a view onto a background job |

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
