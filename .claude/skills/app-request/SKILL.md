---
name: app-request
description: Run an app or feature request for WebOS through the owner's flow — intake, classify, investigate, grill, record (brainstorm/ADR), build in worktree agents, merge and push one at a time, report. Use when the owner relays an idea from someone ("X wants…", "X asked for…", "another idea from X"), says "app request" or "feature request", pastes a Discord or GitHub message, or shares screenshots or videos describing something to add, or asks to record such an idea.
argument-hint: "<requester github handle or name> <request, quote, screenshot or video paths>"
---

# App request

Ideas come in relayed by the owner from someone else, or from the owner. The requester is the idea; the owner is the implementation and the architect. This skill runs one request (or a batch) from paste to pushed release.

Request: $ARGUMENTS

Ground rules that override speed:
- Architecture is the owner's call (CLAUDE.md). Every structural choice goes through the grill in step 4. No "temporary" version, no proceeding under an assumption.
- The shell question is asked for every new app, service or core feature (CLAUDE.md "Shell integration").
- Subagents run on Opus. Builders use the `app-builder` agent. Investigators are investigate-only.
- Commit messages: conventional title, short bullets, no Co-Authored-By, no mention of AI or Claude.

## 1. Intake

1. Restate the request in one line.
2. Map it onto the pitch fields and mark each one known, guessed or missing:

   | Field | Question |
   |-------|----------|
   | Problem | What's annoying or missing today? |
   | What it does | The core action, one sentence |
   | Picture | A sketch, screenshot, video or the tool it's like |
   | Files | Does it open, make or save files? Which formats? |
   | Real example | One concrete time he'd use it |
   | First version vs later | Smallest useful cut; what waits |
   | Phone | Does it matter on mobile? How does touch work? |
   | Feel and name | Mood, vibe, a name idea |

3. Requester: the first argument, or parsed from the request ("from @handle", "by X", a quoted Discord or GitHub author). Prefer the GitHub handle. If none is given and the message doesn't make it obvious, ask once with one `AskUserQuestion` (options: the names the message hints at, plus "me (owner)"). The owner's own requests get no extra credit. Keep the verbatim quote for the brainstorm Context.
4. Private inputs (videos, photos in `~/Downloads`) are test inputs only. Derivatives go in the session scratchpad, never in the repo. H.264 must be transcoded to VP9 WebM for the test Chromium (`ffmpeg -i in.mp4 -c:v libvpx-vp9 -b:v 0 -crf 32 -an out.webm`).

## 2. Classify

| Kind | Path |
|------|------|
| New app | Steps 3–9 |
| Feature in an existing app | Steps 3–9; read its `docs/apps/{id}.md` if listed |
| OS feature (service, shell, desktop, settings) | Steps 3–9; read the ADR and `docs/system/` page |
| Bug or polish | No grill. One `app-builder` agent with the fix scope, then merge (step 7) and report |
| "Just record it" | Write a ROADMAP line or a brainstorm (step 5) and stop |

If the owner only asked to record it, record and stop. A bug that turns out to need a shape change is no longer a bug: go to step 4.

## 3. Investigate

- Read what exists: the app's code, its `docs/apps/` page, the ADR and `docs/system/` page for the area, similar apps for patterns, the UI kit (`$lib/core/components/ui`, `$kit/utils`) for reuse.
- Collect file:line evidence for the brief.
- Feasibility unclear (a browser capability, an algorithm, performance, a format)? Spawn an investigate-only agent on Opus (`subagent_type: general-purpose`, `model: opus`, prompt says "investigate only, no edits"). Ask for: verdict, the lightest approach, alternatives with what breaks, dependencies (prefer none), risks, repo pieces to reuse with paths. Birdseye's NCC tracker report is the model.
- Never build in this step.

## 4. Brief and grill

Use `AskUserQuestion`, per CLAUDE.md "How to ask".

1. **Brief first**, in prose before the first question: what the area is, what exists today (file:line), what needs deciding.
2. **Rounds of at most 4 questions.** Recommended option first, labelled. A code or ASCII preview per option. Say what breaks with each lighter option. Attack your own pick in one line.
3. **Question bank** — ask the ones that apply:
   - [ ] **Home:** new app, a section or tab of an existing app, a kit component, or OS (service, shell, desktop)
   - [ ] **Data and persistence:** a file in `/home` with an association (the Hopsprite / Font Maker pattern), app storage (`app.{id}.*`), or `/var/lib/{area}/…json`
   - [ ] **Format:** JSON shape with `version`, extension, what an export writes
   - [ ] **Algorithm:** lightest-first options (hand-written vs a known technique vs a model)
   - [ ] **Dependencies:** none by default; library vs hand-written with size and what it saves
   - [ ] **Mobile:** both, desktop-only, or a mobile variant; how touch works (pinch, long-press, capture input)
   - [ ] **Shell (always):** commands (Unix verb or `noun verb`), values, completion, `open` through an association, a prop the Terminal or palette passes, an "Open with" entry, shortcuts. "Nothing" is a valid answer, but it's the owner's
   - [ ] **Name and id:** display name, kebab-case id
   - [ ] **Credit:** authors for a new app; byline for a registry entry
   - [ ] **Reuse vs kit:** a piece a second app needs moves to the kit (in its own `refactor:` commit first); a single user stays in the app
   - [ ] **First cut:** what ships now, what goes to "Next session topics"
4. **Listen.** If the owner rejects or reframes ("this is just a widget request"), re-scope and re-brief instead of defending the original plan. When an answer carries notes, follow the notes over the label.
5. Keep grilling until every structural choice has a decision. Then record.

## 5. Record

**Brainstorm:** `docs/brainstorm/YYYY-MM-DD_topic.md`, written during the session, not after. Shape (see `2026-10-20_font-maker.md`, `2026-10-21_widget-styles.md`):

```markdown
# Title
**Date:** YYYY-MM-DD
**Participants:** owner, Claude

## Context
<requester>: "verbatim quote". What exists today (paths). Feasibility findings if any.

## Topics discussed
### Topic (decided)
The decision and why. Rejected: option (what breaks).

## Key takeaways
## Action items
## Next session topics
```

Small features may use one `## Decisions` list instead of per-topic headings.

**ADR** when it's architectural: a new app with a format or algorithm, a new public API (`define_app`, `IService`, props, service interface), a new state layer, a new kind in a core type. Next free number in `docs/adrs/`, a row in `docs/adrs/README.md` (Status: Accepted). An extension of an existing ADR gets a dated revision note on that ADR instead.

Docs are uncommitted at this point. The builder copies them into its worktree and commits them with the build.

## 6. Build

- One `app-builder` agent per item: `subagent_type: app-builder`, `isolation: "worktree"`, `run_in_background: true`. Fill the template in [build-prompt.md](build-prompt.md).
- Independent items run in parallel. Items that edit the same files (e.g. two Clock changes) run one after the other; say so in the brainstorm Action items.
- Tell the owner what's running, one line per agent.
- A user's review screenshots of a shipped item become new fix agents (same template, fix scope).

## 7. Merge

One at a time, as each agent reports, merged locally. Push in groups (owner, 2026-10-21: "group the pushes if you can - not all in one but what makes sense"): a feature with its polish, a health or refactor batch, a risky infra change alone, a set of related new apps. Every push deploys and posts a release, so a group is a release. Follow [merge.md](merge.md) exactly. After each merge, tell the agents still running the new master version.

Before a group is pushed, every `feat:` in it gets a read-only review (CLAUDE.md "Review every feature"): one reviewer per feature, prompt from [review-prompt.md](review-prompt.md), given only the spec and the commits. Verify each finding, fix the real ones, rerun the checks, then push. Fixes themselves don't get a review.

## 8. Report

Per item, caveman-terse:

```
Font Maker — shipped 3.14.0 (a1b2c3d)
Checked: desktop narrow+wide, mobile 390 touch draw, TTF round-trip in Font Viewer.
Not checked: real phone photo of filled sheet.
Rough: scan corner detection weak on glare.
Owner calls: kerning? OTF?
```

Relay the agent's "stopped for a decision" items as open owner calls, never decide them.

## 9. Credit

Credit goes to the requester from step 1; skip all of it when the owner is the requester.

- New app: `meta.ts` gets `authors: [{ name: "<handle>", github: "<handle>" }, OWNER]` with `OWNER` from `$lib/core/api/services/apps/authors`. Requester first, no role field. No GitHub handle known: `{ name: "<name>" }` only.
- App feature or OS feature: name them in the brainstorm Context and the ROADMAP line ("idea from <handle>").
- Registry entries with a byline (live wallpapers) take `authors` the same way.
- Changelog lines don't name people as a rule.

## 10. Private inputs

Videos and photos from the owner or the requester are for testing only. Copy or transcode into the scratchpad, pass the scratchpad path to the builder, never commit them, never reference them in docs.
