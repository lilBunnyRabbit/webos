# Font Maker: Burrow ordinals, italics per weight, kerning
**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
Owner asked for the Font Maker next-session items ([font maker](2026-10-20_font-maker.md), [app font](2026-10-21_app-font.md)). One investigate-only report:
- E. Burrow's Bold ª/º: the underline bar stays at y=300 while the Bold redraw moves the bowl up; the gap shrinks from ~55 (Light) to ~27 units (Bold) and the two merge. The stroke is also thick for the size (pressure 0.3 gives 0.7× width on letters 0.62× the size of `a`).
- D. One italic redraw serves every weight and wins over the weight's redraw (`face_strokes`, model.ts:165), so Burrow's Bold Italic `a` sits ~22 units above x-height and below the baseline against the other Bold Italic letters.
- A. Spacing is ink box plus bearing; AV, To, LT look loose.
- B. Auto-trace was rejected in ADR-055.
- C. OTF/CFF converts the same quadratic curves into cubic ones with no gain.

## Decisions
- **Build E, D, A in that order**, one builder after another (same files).
- **E:** sample data fix: in the 700 redraws move the ª/º bar down so its bottom ink stays put; lower the Bold ordinal pressure only if it still reads heavy. Rebuild `public/fonts/*` under V8. Changelog `fixed`.
- **D:** additive `italics?: Record<weight, Stroke[]>` beside `italic`; fallback `italics[w]` → `italic` → `weights[w]` → `strokes`. The face picker lists every face. Burrow gets Light Italic and Bold Italic `a` redraws.
- **A:** legacy `kern` format 0, with a browser test first proving Chromium applies it. Auto kerning from glyph side profiles, per face at build time, nothing stored; manual pair overrides on top, stored. UI: tap a gap between two letters in the preview line, − / + stepper (10 units), Reset, Auto on/off. Same layout on phones. Rejected: manual only; GPOS PairPos (L, only needed for kerning that varies by weight).
- **Format v3** for `italics` and `kerning`: old clients refuse a newer file instead of silently dropping the fields on save. v2 files still open.
- **B stays rejected** (ADR-055). **C closed.**
- **Shell:** nothing.

## Action items
- [x] E: Bold ª/º fixed 2026-10-21. Moving the bar alone (y=285, top ink at Regular's 327) opened the gap from 28/27 to 43/42 units, but the Bold ª still read as a dark lump at 18 px with its counter nearly closed, so the 700 redraws also went to pressure 0.22 with the bar at y=292 (top ink still 327): gap 51 (ª) and 49 (º), Regular 44, Light 56. Fonts rebuilt under V8.
- [x] D: italics per weight, 2026-10-21. `italics?: Record<weight, Stroke[]>`, format 3. The regular weight's italic face keeps drawing the shared `italic`, so it still serves every italic face without its own redraw; Light Italic, Bold Italic and the rest draw `italics[w]`. Burrow's Light and Bold Italic `a` are the italic `a` moved inward like the other weight redraws: Bold Italic `a` went from 22 units above and 23 below the Bold Italic `o` to 0 and 1, Light Italic from 15 and 14 inside to 0. Fonts rebuilt under V8.
- [x] A: kerning, 2026-10-21. A browser test first: Chromium shapes with a legacy `kern` format 0 table ("AV" with a −200 pair measured 100 px at 100 px against 120 without). Auto kerning from 20-unit band profiles per face; manual `kerning.pairs` on top, `kerning.auto` true for new projects and absent (no `kern` table) in older files, so the shipped Burrow fonts stay byte-identical. Burrow's own kerning is not decided.

## Next session topics
- GPOS if pair counts or weight-dependent kerning call for it.
- Auto-trace, if tracing by hand on phones becomes the pain.
