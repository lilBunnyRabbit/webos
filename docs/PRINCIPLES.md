# Principles

Why WebOS exists, what matters in it, and how decisions get made. Read this before writing code or proposing a design. [CONVENTIONS.md](CONVENTIONS.md) covers the *how*; this covers the *why*.

Every claim here is backed by a decision in `docs/adrs/`, `docs/brainstorm/`, or the owner's own words in old Cursor chat exports. Those exports were deleted on 2026-10-10 and are in git at `6be283e:docs/to-be-deleted/cursor_*.md`. Quotes are verbatim.

---

## What this is

A desktop environment in the browser: windows, taskbar, desktop, file system, apps. Static site on GitHub Pages, no backend.

It is three things at once:

1. **A learning project.** It was rewritten from React to Svelte 5 for this reason: *"Okay i dont mind how much i need to rewrite - its all a learning experience."*
2. **A home for side projects.** The owner's own work moves in as apps: `static-utils`, Chromatics, quno, `@lilbunnyrabbit/task-manager`, puzzle games (ADR-009, ADR-013).
3. **A portfolio piece.** Deep links and demo presets exist so someone can open a curated workspace from a link (ADR-010).

It's a solo project. There are no contributors to optimise for.

## What matters most

**The architecture and the reasoning behind it matter more than the feature count.** The end product is the vehicle. What the owner values is that each technical decision was understood, compared against alternatives, and written down.

For anyone working on the code, that means:

- A feature that ships with an unexamined structural choice is a regression, even if it works.
- A feature that ships later with a recorded decision is the goal.
- **Agents never make architectural decisions.** The owner does, every time. An agent's job on a structural question is to:
  - investigate
  - lay out the options
  - recommend one and attack its own recommendation
  - grill the owner with the hard questions
  - record the outcome

  The rules and the "what counts" list are in [CLAUDE.md](../CLAUDE.md#architecture-is-the-owners-call-always). Implementing inside an existing pattern or an existing ADR is not architecture; just do it.

---

## How decisions get made

These patterns repeat across ADRs and brainstorms. Apply them before proposing anything.

### 1. Infrastructure has to earn its place

The owner's first question about the kernel was *"Is it just a gimmic or are there any actuall good usecases?"* Abstract benefit lists got *"Still not sure."* The kernel survived only once a concrete use was named: swapping service implementations for mobile and desktop (ADR-016).

The same test killed or shrank other ideas:

| Proposed | Outcome | Why |
|----------|---------|-----|
| Capability system | Deferred | Browser JS can't enforce it without iframes. It would be "security theater" |
| Router service | App-level pattern | In-app navigation isn't a system concern |
| PlatformService | `kernel.platform` value | One value doesn't need a service |
| IPC service | Not needed | Svelte state and context already cover it |
| Clipboard API, system dialogs | Dropped | No concrete use case |
| Bash-like shell scripting | Rejected | A command dispatcher with structured output is enough |
| Service priority field | Never added | Dependencies cover ordering |

**Rule:** name the concrete thing that breaks today without it. "Future-proofing" is not a use case, and saying so out loud is expected.

### 2. Lightest approach that fits the constraints

- Update detection uses `version.json` polling. A service worker, SSE, and the GitHub API were all considered and rejected (ADR-004).
- Session state goes to localStorage, not IndexedDB (ADR-014).
- Commands are flat, not subcommand trees (ADR-007).
- Window animations use CSS, not JS (ADR-014).
- Runtime platform detection happens once, with no live switching (ADR-016).

### 3. Explicit over magic

- An app's component is an explicit `() => import(...)`. Convention-based discovery was rejected as *"too much magic"* (ADR-001).
- Apps use Svelte's own `onMount` plus a window handle, not lifecycle callbacks in the manifest (ADR-003).
- Domain logic stays in the service that owns it. The `open` command belongs to AppsService, not the shell (ADR-007).

### 4. Use the platform

- Use Svelte primitives (context, runes, attachments) before building anything custom.
- Use browser APIs before libraries: OPFS for files, container queries for responsive apps, CSS for layout.
- Hosting is static, so anything that needs a server needs an ADR.

### 5. Correct beats clever

ADR-005 first shipped a shared `SvelteMap` cache of directory handlers so two explorers stayed in sync. It was **removed**: path keys go stale on rename or move. The ADR records the trade-off: *"correctness over stale cache."* Reverting your own clever idea, and writing down why, is the expected behaviour.

### 6. Performance by design, not by tuning

React was abandoned over re-render cascades: *"As soon as im starting to add some complexities it feels like a struggle with the rerendering."* Performance is shaped into the structure:

- Fine-grained runes.
- An O(1) focus check: the window whose order equals the max is focused.
- Lazy app components, so the project can have *"a ton of apps"* with no heavy initial load.
- `requestAnimationFrame` batching during drag, and CSS `contain` on windows.

### 7. How it feels is a real criterion

- *"feels shitty to implement"* was enough to reject Zustand and `useSyncExternalStore`.
- *"it is fast but feels cheaty"* was a fair question about a working z-index trick.

Code that reads well and has an honest shape counts. A solution that works but feels like a hack should be called out, not hidden.

### 8. The owner's taste is a valid reason

snake_case in a camelCase ecosystem was debated openly (*"Just feel like I'm complicating a standard because of my preference"*) and **kept**. The same goes for always using the namespace prefix: *"I will never destructure the WindowManagerApi i always prefer the prefix. Same thing with the `React.` things."*

Settled decisions are not reopened in passing. Reopen one only with new evidence, as a brainstorm, and say so explicitly.

---

## How the owner works with an agent

- **Explain the mechanism, not the benefits.** The questions were *"how does that actually work?"* and *"How do i check what service is using the other service?"* Show the call path.
- **Lay out options, then recommend.** The owner explores 3 to 5 options before settling. For each lighter option you reject, say what breaks.
- **Answer every part of a multi-part question.** *"you didnt reply to the prerendering"* came after one part was skipped.
- **The old React design is a reference, not a template.** The ask is always for the Svelte-native version of it.
- **No AI slop.** The legacy TODO literally says *"Fix all AI shit."* The deleted legacy specs were AI output the owner threw away. Don't produce:
  - boilerplate docs
  - emoji headings
  - fake timelines
  - speculative "Phase 1 to 9" plans
  - comments that restate code
- **Push back.** If a request or an ADR looks wrong once it meets the code, say so with evidence. Agreement isn't the job.

---

## The process

```
idea → brainstorm log → ADR → ROADMAP item → code → ROADMAP + ADR status updated
```

| Artifact | Holds | Lives in |
|----------|-------|----------|
| Brainstorm | The discussion: options, back-and-forth, dropped ideas | `docs/brainstorm/YYYY-MM-DD_topic.md` |
| ADR | The decision, alternatives, consequences | `docs/adrs/NNN-title.md` |
| Roadmap | What's done, what's next, priority | `docs/ROADMAP.md` |

Most ADRs were designed **ahead** of the code. "Accepted" does not mean "implemented", and the ADR index says which is which.

When implementing an ADR:

1. Re-read the ADR, then check it against the current code. The code may have moved since.
2. If reality forces a deviation, update the ADR with a dated revision note. ADR-005 shows how. Don't silently diverge.
3. If the ADR doesn't cover a structural choice you're about to make, stop and grill the owner. That's a new decision, and it belongs in a brainstorm or an ADR, not in a commit.

---

## Known tensions

- **Scope.** ADR-009 catalogues 30+ apps, and ADR-015 adds sound effects and theme sharing. Meanwhile the core P0 work is unfinished: app context. The architecture review said *"Simplify before scaling."* Work P0 before P3 unless told otherwise.
- **Multi-window file sync.** It was a hard requirement in the React days (*"if i have two windows open and i add a file to any of them that will reflect in both windows"*). ADR-005 dropped it for correctness. It's still wanted, just not via a path-keyed cache. Event-based invalidation is the recorded way back in.
- **Code ahead of docs, docs ahead of code.** App context (ADR-003) doesn't exist yet. Don't write code that assumes it.

## Settled 2026-10-10

- **Icons:** `phosphor-svelte` only. Lucide was removed.
- **Naming:** snake_case everywhere, ADR snippets included. The one exception is the deployed `version.json` wire format (see CONVENTIONS).
- **Lifecycle (ADR-002):** implemented 2026-10-10 without swap. See the ADR revision.
- **Legacy docs:** `docs/to-be-deleted/` was deleted. The owner quotes above came from its chat exports, which you can recover with `git show 6be283e:docs/to-be-deleted/<file>`.
