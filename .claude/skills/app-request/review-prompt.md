# Review prompt template

Every `feat:` gets one read-only reviewer before its group is pushed (CLAUDE.md "Review every feature"). `subagent_type: general-purpose`, `model: opus`, `run_in_background: true`. Give it the spec, never the builder's report. Fill every `{…}`.

```
REVIEW ONLY, NO EDITS. Repo /Users/lilbunnyrabbit/dev/orgs/lilbunnyrabbit/webos.
Read CLAUDE.md and docs/CONVENTIONS.md first.

Feature: {name}. Spec: {ADR path}, {brainstorm path}{, decisions not yet in a file, verbatim}.
Commits: {sha list} (`git show <sha>`), and the current versions of the files they touch.

Check the commits against:
- the spec: everything decided is built, nothing undecided was decided silently;
- CLAUDE.md hard rules and CONVENTIONS;
- .claude/skills/health-pass/auditors.md sections 5 (code standards), 6 (fork
  promise and encapsulation) and 7 (docs accuracy), applied to these commits;
- correctness: races (two windows, two tabs), leaks (listeners, object URLs,
  workers, media tracks), promises that never settle, data loss, persistence
  and migration, Svelte 5 reactivity, desktop and mobile layout visible in code.
{Privacy: never read real user data files or anything in ~/Downloads.}

Report defects only, no style nits. Per finding: file:line, one-sentence defect,
concrete failure scenario (inputs/state → wrong result), severity (high/medium/low),
confidence. Read the code to confirm each one before reporting; drop anything you
can't back up. Also list what you checked and found clean. Under 700 words, most
severe first.
```

After it reports: verify each finding yourself, fix the real ones (an `app-builder` fix agent, or directly when small), rerun `bun run check` and the tests, then push.
