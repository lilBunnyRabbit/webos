# Health pass
**Date:** 2026-10-21
**Participants:** owner, Claude
**Baseline:** c1ab4c13 (3.27.0) · **Head:** 98f864ab (3.40.0) · **Harness:** scratch scripts this pass; committed to `scripts/perf/` by the follow-up

## Context
Owner: "Do a pass that checks that performance is still where it was. i am looking at core performance not individual apps. i dont want any of the new functionality to be too invasive or have any big impact on performance", later "this also includes code checks that it is still all up to the standard and documentation is correct". First run of the `health-pass` skill: seven read-only auditors (boot, idle, interaction, update weight, code standards, fork and encapsulation, docs), base and head built in the scratchpad, runs interleaved, medians with min–max.

## Measurements
| Metric | Base | Head | Delta | Runs, method |
|---|---|---|---|---|
| Boot chunk (budget 190) | 173.5 KB gz | 182.0 KB gz | +8.5 (scheduler +7.4 in core) | `bun run budget` |
| First visit splash end @1× | 131 ms | 142 ms | +11, overlap | 7, Playwright + CDP |
| First visit splash end @4× | 394 ms | 425 ms | +31, overlap | 7 |
| Slow 4G first visit @4× | 4669 ms | 4780 ms | +110, no overlap | 5 |
| TBT @4× (first / mobile / SW) | 79 / 82 / 93 | 96 / 114 / 109 | overlap | 7 |
| JS heap after boot | 7.9 MB | 8.5 MB | +0.5 | 7 |
| Idle wake-ups / min | 1 | 2 | +1 (scheduler 60 s timer) | 5 (10 + 4×3 min) |
| Idle locks / OPFS per min | 0 / 0 | 1 / 3 | scheduler pass | 5 |
| Idle script ms/min (visible) | 2.84 [1.28–15.52] | 3.11 [1.79–9.37] | noise | 5 |
| Per window focus | 0 locks | 1 lock, 3 OPFS, +0.13 ms | no overlap | 5 |
| Interaction (open, drag, resize, launcher, toasts, focus switch) | — | — | within noise | 5 each, 1× and 4× |
| Mobile app drawer open, max frame | 50 ms | 16.8 ms | −33 (better) | 5 |
| Precache | 745 entries, 4.40 MB gz | 777, 4.59 MB gz | +0.19 MB (mammoth 99 KB gz) | manifest parse |
| One-line core change, files renamed | — | 17 (0.26 MB gz) | import-map promise holds | rebuilds |
| Update base → head, 20 Mbps / 40 ms | — | 29.5 s (630 files, installed one at a time) | — | 5 |

## Code standards and fork
Hard rules clean (no `any`, `#private`, TS enums, destructured services, hardcoded colours, hover-only actions). Findings: duplicated HH:MM parsers and an identical `When`/`JobAt` union; Warren's find bar latches state in an `$effect`; Soundboard and Birdseye import Video Tools helpers; the kit WebM muxer stamps "WebOS Video Tools"; a 4th flash-message copy; error-toast bodies repeated in 16 files; a Calendar brute-force test that broke the deploy (fixed in 01b458b1). Fork: check, build and boot pass; 9 core browser tests launch real user apps (CI's fork job runs unit tests only); the intro's interests and Getting started name user apps; first-boot samples use user app formats.

## Docs
31 stale or missing statements fixed in e5cba0c2 (incl. a new `docs/apps/soundboard.md`).

## Bugs found
- Burrow font files are cached CacheFirst at an unversioned URL, so font fixes never reach existing installs.
- The scheduler reads its registry twice at boot.
- An offline boot logs "Failed to check for updates".

## Topics discussed
### Scheduler idle work (decided)
All four fixes: no timer while there are no jobs; the heartbeat aligned to the minute like the taskbar clock; no double leadership steal and no pass when the tab goes hidden; the "seen" broadcast only when a badge exists. ADR-062 revision ("min(next due, 60 s)" only while jobs exist). Rejected: the zero-jobs fix alone; accepting.

### Scheduler in the boot chunk (decided)
Accepted for now (8 KB under budget; every service loads this way). Revisit when the budget gets tight. Rejected: splitting the planning code into a lazy chunk.

### Update speed (decided)
Own the service worker: `injectManifest`, a typed SW whose install fetches changed files in parallel batches and skips unchanged ones; `sw-notifications.js` moves inside it; VersionService's precache parser follows. ADR-004 and ADR-062 revisions. Rejected: accepting ~30 s after skipping versions.

### mammoth (decided)
Out of the precache; a CacheFirst runtime rule keeps it after the first .docx import. Rejected: precaching for everyone.

### Kit helpers (decided)
`report_error(app_id, title, reason)` and a flash-message helper in the kit; apps switch to them.

### Fork (decided)
Hide what's missing: interests with no registered app are hidden, samples only for formats an installed app opens, Welcome.md names present apps only; Getting started skips topics whose app is missing. Core tests use stand-in apps; CI's fork job also runs the core browser tests. Rejected: manifest `interest`/`samples` fields; accepting.

### Conventions (decided)
CONVENTIONS allows inline prop types; `interface Props` required for kit/ui components. `JobKind.PHASE` documented as a generic timed phase.

## Key takeaways
- Core interaction and boot are where they were; the only invasive cost of the new work was the scheduler's idle wake-ups, now fixed for people with no jobs.
- Update time, not boot time, is the real user-facing cost left; owning the service worker addresses it.

## Action items
- [x] Scheduler fixes (idle four, double boot read, phase wording, quiet offline version check)
- [x] Service worker: injectManifest + parallel install, mammoth runtime cache, versioned Burrow font URLs, import-map `\0` identity fix (3.45.0). Measured at 20 Mbps / 40 ms over HTTP/2: update from 12 versions back 30.1 → 10.8 s, first install 35.7 → 12.0 s, one-line change 2.06 → 1.45 s. Chromium runs `install`-event fetches ~3 at a time, so 8/12/16 in flight measure the same; lifting that means the page downloading into the precache (owner call).
- [x] Kit `report_error` + flash helper sweep; CONVENTIONS amend
- [x] Fork + tidy: stand-in test apps, CI fork browser tests, interests/samples/Getting started guards, Style Guide ai_icon demo, video helpers to kit, WebM app name, duplicate parsers and types, Warren find effect, dead exports and imports, `scripts/perf/` harness (Soundboard still imports `VIDEO_ACCEPT` / `is_video_name` through Video Tools' re-export)

## Next session topics
- Promote `tasks.run` and the AI calls to the stable app API.
- Window focus shadow transition (~79 ms task per focus switch with 10 windows @4×, pre-existing).
- Launcher first-open cost grows with app count (74 user apps).
- Heap grows ~0.4 MB per 10 window open/close cycles (pre-existing).
