---
name: health-pass
description: Run WebOS's recurring health pass — core performance against a baseline (boot, idle, interaction, update weight), code standards (hard rules, conventions, fork promise, encapsulation) and docs accuracy (system reference, per-app pages, ADR index, ROADMAP, CLAUDE.md tables) — with parallel read-only auditors, then owner calls, fixes and a recorded result. Use when the owner asks for a performance pass, a code quality pass, a docs check, "check nothing got slower", "is everything still up to standard", or a health check after a batch of features.
argument-hint: "[baseline ref, default: the last pass's commit] [focus: perf|code|docs|all]"
---

# Health pass

A recurring check that the OS is still fast, still clean and still documented after a batch of features. Past passes: [code quality 2026-10-15](../../../docs/brainstorm/2026-10-15_code-quality-pass.md), [performance 2026-10-17](../../../docs/brainstorm/2026-10-17_performance-pass.md). Each pass is a brainstorm log `docs/brainstorm/YYYY-MM-DD_health-pass.md` with the numbers, so the next pass compares against it.

Scope is **core**: kernel, services, shell UI, kit, boot and the service worker. Apps count only where they load or run without being opened (manifests, badges, widgets, shell commands, scheduler jobs). An app-by-app pass is a separate request.

Ground rules:
- Auditors are read-only (`general-purpose`, `model: opus`, prompt says "investigate only, no edits"). They never use AskUserQuestion.
- Fixes that follow an existing pattern go to `app-builder` agents. Anything architectural (CLAUDE.md "Architecture is the owner's call") goes to the owner first.
- Numbers or it didn't happen: every perf claim has a before, an after, how it was measured, and the run count.

## 1. Set up

1. Wait until no builder is running and master is pushed and clean (`git status`, `git log origin/master..`).
2. **Baseline ref:** the argument; else the commit recorded at the top of the latest `*_health-pass.md` (or the 2026-10-17 performance pass); say which one and why.
3. **Head ref:** current master.
4. Build both into the scratchpad (never into the repo): `git worktree add <scratch>/base <ref>`, `bun install`, `bun run build`; same for head. Note `bun run budget` for both.
5. Measurement harness: `scripts/perf/` (Playwright + CDP, Chromium, against `vite preview` of each `dist`). If it doesn't exist yet, the boot auditor creates it in its report as a proposed file set; the first builder of the pass commits it (`chore:`), so later passes reuse the same measurements. Every auditor uses the harness rather than ad-hoc scripts once it exists.

## 2. Audit (parallel)

Spawn the auditors in [auditors.md](auditors.md) in one message, each with base and head paths, ports and the focus. Default focus `all` runs all seven; `perf` runs 1–4, `code` runs 5–6, `docs` runs 7.

Same machine, same Chromium, both builds measured back to back, ≥5 runs each, report median and spread. 1× and 4× CPU throttle where timing matters. Headless numbers are relative, never absolute promises.

## 3. Triage

Merge the reports into one table: area, metric or finding, base, head, delta, cause (file:line), fix kind (pattern fix / owner call / accept).

- A regression within noise (spread overlaps) is not a regression.
- Budget breaks are always findings: boot chunk over `BOOT_BUDGET` (scripts/boot-budget.ts), a long task (>50 ms) at boot or during drag that the base didn't have, work while idle that the base didn't have, a hidden tab waking more than once a minute.
- New functionality is judged on "invasive": cost paid by people who never use it (boot, idle, every tab).

## 4. Owner calls

Brief first (what was measured, the table's headline), then AskUserQuestion rounds of ≤4: recommended option first, a code preview each, what breaks with each lighter option, the strongest argument against the pick. Accepting a regression is a valid answer; record why.

## 5. Fix

- One `app-builder` per independent fix group (core/shell, kit, docs), template [../app-request/build-prompt.md](../app-request/build-prompt.md), each told to re-measure with the harness and report before/after.
- Merge per [../app-request/merge.md](../app-request/merge.md), push one by one.
- Perf fixes users can feel get a `fixed`/`improved` changelog line; refactors and docs don't.

## 6. Record

`docs/brainstorm/YYYY-MM-DD_health-pass.md`:

```markdown
# Health pass
**Date:** YYYY-MM-DD
**Participants:** owner, Claude
**Baseline:** <ref> (<version>) · **Head:** <ref> (<version>) · **Harness:** scripts/perf @ <ref>

## Context
## Measurements          (table: metric, base, head, delta, runs, method)
## Code standards        (findings → fixed / owner call / accepted)
## Docs                  (stale → fixed)
## Topics discussed      (owner calls with decision and rejected options)
## Key takeaways
## Action items
## Next session topics
```

Then ROADMAP (`[x]` the pass, open owner calls as `[ ]` lines under P4) and a final report: headline numbers, what was fixed, what was accepted and why, what is still open.
