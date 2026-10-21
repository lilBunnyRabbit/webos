# Auditor prompts

Each runs as `general-purpose`, `model: opus`, background. Prepend to every prompt:

```
INVESTIGATE ONLY. No edits to the repo, no commits, no AskUserQuestion. Scratch files only under <scratchpad>/health-pass/<auditor>/.
Repo: /Users/lilbunnyrabbit/dev/orgs/lilbunnyrabbit/webos. Read CLAUDE.md, docs/PRINCIPLES.md, docs/CONVENTIONS.md first.
Baseline build: <base dist path> (ref <base>), head build: <head dist path> (ref <head>). Serve each with `vite preview` on its own port.
Measure both back to back on this machine, ≥5 runs each, report median and min–max; 1× and 4× CPU throttle where timing matters.
Every finding: base value, head value, delta, method, cause with file:line, and whether the fix fits an existing pattern or is an owner call.
Scope is core (kernel, services, shell UI, kit, boot, service worker); apps only where they cost something without being opened.
```

## 1. Boot

- Boot chunk gz per file and total (`bun run budget` on both), entry + modulepreload list, new eager imports since base (diff the boot chunk's module list via the build manifest or `rollup-plugin-visualizer`-style analysis without adding a dependency).
- Cold boot to interactive desktop and to splash end, desktop and `?platform=mobile`, fresh profile, with and without the service worker cache; 4× throttle; Slow 4G for the first visit.
- Per-service `init()` time (performance marks around `kernel.init` steps; the splash already reports steps), long tasks during boot, network requests during boot (count, bytes, anything new like `version.json`).
- If `scripts/perf/` doesn't exist: propose it (files and code in the report) — boot, idle and interaction scenarios, CDP tracing, JSON output a later pass can diff.

## 2. Idle and background

- 10 min idle on a desktop with default widgets, visible tab, then hidden tab, then a second tab open: timers fired per minute (CDP `Overlay`/tracing or patched `setTimeout`/`setInterval` counters injected before load), script time per minute, wake-ups, OPFS reads/writes, Web Locks traffic, BroadcastChannel messages, network requests.
- Heap after boot, after 10 min idle, after opening and closing 10 windows (leaks).
- Anything that runs per tab focus/visibility change and what it costs.
- Specifically new since base: list every listener, timer, lock, channel and observer the head adds at boot and whether people who never use the feature pay for it.

## 3. Interaction

- Frame times (p50, p95, max) and long tasks for: open a window, drag a window, resize, maximize/minimize (view transitions), open the launcher and type, Mod+K palette, switch windows with 10 open, desktop marquee, toast in and out, notification center open. Desktop and mobile shell (390 px, touch).
- Svelte re-render hot spots: components re-running on unrelated state changes (e.g. a store read in the taskbar that changes every second).

## 4. Update and service worker weight

- Precache entry count and bytes, base vs head; runtime caches; the `sw.js` size and anything `importScripts` adds.
- Files changed for a one-line core change and a one-line app change (the import-map promise: few files per core change), measured by building head twice with a trivial edit.
- Time and bytes for `apply_update()` from base to head.

## 5. Code standards

- CLAUDE.md hard rules over the diff base..head: runes only, no `any`, `interface` for shapes, snake_case/PascalCase/kebab-case, const-object enums, services via `kernel.service` in `$derived` never destructured, pure `.ts` / `.svelte.ts` / `.svelte` split, theme tokens only (no new colours, no Tailwind palette), container queries in app UI, TS `private` not `#`, comments only for non-obvious why.
- Kit rule: a component or pattern two apps need lives in the kit + design docs + Style Guide; find copies.
- Dead code and unused exports introduced since base; duplicated helpers; deep imports past barrels.
- `bun run check` 0 errors, `bun run test` green, and the per-file test convention (`*.test.ts` Node, `*.browser.test.ts` Chromium).

## 6. Fork promise and encapsulation

- Re-run the fork experiment on head: a scratch copy with `src/lib/apps/user` deleted; `bun run check`, `bun run build`, `bun run test`, boot desktop and mobile. Any core import of a user app is a finding.
- Core reaching into app data paths, app ids hardcoded in core, services depending on things outside their declared deps (compare `init.ts` with the CLAUDE.md table).

## 7. Docs accuracy

- For every commit base..head: the matching `docs/system/` page, `docs/apps/{id}.md` (per the CLAUDE.md table), ADR revision notes, `docs/adrs/README.md` status, ROADMAP line, CLAUDE.md services and per-app tables, `docs/system/persistence.md` keys, `docs/system/services/shell.md` contributions, `docs/design` + Style Guide for kit additions, changelog top entry == package.json.
- Read the code, not the commit message: list each statement in the docs that is now false, with the file:line that contradicts it.
