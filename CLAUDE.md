# WebOS — agent guide

A desktop environment in the browser, built with Svelte 5. It's a solo learning project, and the reasoning behind each technical decision matters more than the feature count.

## Read first

1. [docs/PRINCIPLES.md](docs/PRINCIPLES.md): why the project exists, how decisions get made, how the owner works. **Mandatory.**
2. [docs/CONVENTIONS.md](docs/CONVENTIONS.md): where code goes, naming, Svelte and styling patterns.
3. [docs/ROADMAP.md](docs/ROADMAP.md): what's done and what's next.
4. [docs/adrs/README.md](docs/adrs/README.md): the ADR index, showing which are implemented and which are only accepted.

Read the ADR for the area you touch before you touch it.

## Quick start

```bash
bun install
bun dev
bun run check   # must stay at 0 errors
```

## Architecture in one screen

The kernel is a service registry with dependency resolution. `kernel.init()` builds services in dependency order and awaits each `init()` before the app mounts (ADR-002). Services are domain classes using runes, registered in `src/lib/core/api/kernel/init.ts`. Its job is to let one implementation be swapped for another, for example mobile and desktop (ADR-016). It is not a security boundary.

| Key | Service | Purpose | Depends on |
|-----|---------|---------|------------|
| `settings` | SettingsService | Theme tokens, taskbar position (persisted) | none |
| `windows` | WindowsService | Window lifecycle, geometry, z-order, snap | none |
| `files` | FilesService | OPFS: `opfs.ts` → `DirectoryHandler` → service (ADR-005) | none |
| `version` | VersionService | `version.json` polling (ADR-004) | none |
| `notifications` | NotificationsService | Toasts + history (ADR-006). Report user-facing errors here | none |
| `apps` | AppsService | Registry from glob, `launch()` validates props (ADR-008), `open(path)` by association (ADR-018) | windows, notifications, files |
| `desktop` | DesktopService | Icon grid | apps |

Planned services each have an ADR: shell (007), shortcuts (012), tasks (013). Add a service only when that roadmap item is picked up.

```ts
const windows = $derived(kernel.service<WindowsService>("windows"));
windows.focus(id); // always via the prefix, never destructured
```

Apps are auto-discovered from `src/lib/apps/{system,user}/{id}/index.ts`, using `define_app()` plus a lazy `{id}.app.svelte`. See CONVENTIONS. Inside an app, `get_app_context()` from `$lib/core/contexts/app` gives its window handle (reactive state, controls) and `app.{id}.*` localStorage (ADR-003).

## Hard rules

- Runes only. No `any`. `interface` for object shapes.
- `snake_case` for code identifiers, `PascalCase` for types and components, `kebab-case` for files. This is settled; don't relitigate it.
- Const-object enums, not TS `enum`.
- Access services through `kernel.service<T>("key")` in `$derived`. Never destructure a service.
- Pure logic in `.ts`, reactive state in `.svelte.ts`, rendering in `.svelte`.
- Follow the [lilBunnyRabbit brand](https://lilbunnyrabbit.github.io/brand/) (see CONVENTIONS, Styling & brand). Use theme tokens only. Tailwind's default palette is disabled, and no colour may be added.
- Container queries in app UI, not viewport breakpoints.
- No new dependency without asking. zod and `@lilbunnyrabbit/task-manager` are already approved by ADRs.
- No backend. GitHub Pages is the host.

## Architecture is the owner's call, always

**Never make an architectural decision yourself.** That's the most important rule in this repo. The decisions are the point of the project. An agent that decides one for the owner has taken the part they care about most.

### What counts as architectural

Anything that changes how the system is shaped and isn't already decided in an ADR or in CONVENTIONS:

- a new service, or changing what a service owns or depends on
- a new state layer: a store, context, global, or cache
- a new abstraction, manager, registry, or event/pub-sub mechanism
- changing a public API shape: a service interface, `define_app`, `IService`, app props, or the shape of a WindowHandle
- a new dependency, or a new browser API that becomes part of the core
- persistence: what gets stored, where, and in what format
- deviating from an ADR, or from the pattern the repo already uses for the same thing
- anything justified by "we'll need it later"

### What doesn't count

Just do these:

- implementing a component or feature inside an existing pattern
- implementing what an ADR already specifies
- bug fixes that don't change shape
- renames, formatting, docs, tooling

### When in doubt

Treat it as architectural.

### How to ask: grill the owner

Don't present a menu and wait for a click. Interrogate:

1. **Stop before the first edit.** Do the investigation, then stop. Never ship a "temporary" version of the architecture to ask about later. Never "proceed under an assumption" on architecture.
2. **Brief first.** Before the first question, give a short plain brief of the topic: what the ADR or area is for, what exists in the code today, and what needs deciding. The owner must never have to guess what a question is about.
3. **State the problem and its root cause** in one or two sentences, with the evidence (file:line).
4. **Lay out the real options**, lightest first. Show a code sketch of each and say what breaks with each one.
5. **Recommend one, then attack it yourself.** Give the strongest argument against your own pick.
6. **Grill.** Ask the hard questions the owner may not have considered:
   - What breaks today without this?
   - Which ADR does this contradict or extend?
   - What happens with two windows of the same app open?
   - What happens on mobile (ADR-016)?
   - What happens when a service is swapped?
   - How does this get persisted or restored?
   - What's the smallest version that still answers the question?
   Challenge assumptions in the request itself if they look wrong.
7. **Record it.** Once the owner decides, log the discussion in `docs/brainstorm/`. If it's final, write an ADR. Only then implement.

Claude Code: use `AskUserQuestion`, putting the recommended option first and a code preview per option. Never ask in prose and then carry on.

Sub-agents that implement get this section in their prompt. Otherwise scope them to investigation only.

If architectural work is blocked waiting on the owner, finish everything that doesn't depend on the answer. Then stop and report.

## Documentation duties

### Brainstorm logs

For design or architecture discussions, write `docs/brainstorm/YYYY-MM-DD_topic.md`, using lowercase and hyphens. Update it **during** the session, not only at the end. Sections:

- Date and participants
- Context
- Topics discussed, with decisions
- Key takeaways
- Action items
- Next session topics

Link earlier sessions when relevant. Use one file per major topic.

### ADRs

Write an ADR when a decision is final but not yet implemented: structural choices, API design, patterns used across the codebase. Add it to the index in `docs/adrs/README.md`.

```markdown
# ADR-{number}: {Title}
**Date:** YYYY-MM-DD
**Status:** Accepted | Implemented | Superseded by ADR-X | Deprecated

## Context
## Decision
## Alternatives Considered
## Consequences
```

When implementation forces a change, add a dated revision note to the ADR (see ADR-005). Don't let code and ADR silently diverge.

### Roadmap

At the end of every session that completes work, update `docs/ROADMAP.md`: `[x]` done, `[-]` partial. It is the single source of truth for progress. Also set the ADR's status in the index.

## Commits

Use conventional commits (`feat:`, `fix:`, `refactor:`, `docs:`, `chore:`). Body is short bullets. Renames toward the naming rules go in their own `refactor:` commit.

## Reference only

- Legacy React-era docs and AI-written specs were deleted on 2026-10-10. They're in git at `6be283e:docs/to-be-deleted/` and are outdated: capabilities, IPC, 11 services, camelCase APIs. Don't revive them. The owner's quotes that still matter are in PRINCIPLES. Their ideas are in the legacy gap analysis brainstorm and the ROADMAP.
- Branch `master`: the original React implementation. It's a source for porting (Media Preview, Tic-Tac-Toe, Profiler), not a design template.
