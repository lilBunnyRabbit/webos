# Merge checklist

Run once per finished `app-builder` agent, in the order they report. Pushes go in groups (see SKILL.md step 7): keep local history ordered so a group is a prefix, and push it with `git push origin <last-sha-of-group>:master` once its suite and UI check pass.

## Before

- [ ] Read the agent's report. Any "stopped for a decision" item goes to the owner; still merge the rest if it stands on its own.
- [ ] `git -C <worktree> log --oneline master..HEAD` — note the commit hashes and the branch.

## In the main checkout

- [ ] `git branch --show-current` prints `master`. If not, stop and find out why.
- [ ] `git status` — account for every change. Someone else's uncommitted work is not yours: leave it, don't stage it.
- [ ] Remove the untracked copies of docs the agent committed (the brainstorm, the ADR): `rm docs/brainstorm/… docs/adrs/…`. Compare first if the local copy changed after the agent copied it; fold the difference in after the pick.
- [ ] Stash unrelated local edits to files the pick touches (e.g. a pending `docs/adrs/README.md` row): `git stash push -- <paths>`.
- [ ] `git cherry-pick <commits>` in order.

## Conflicts

- [ ] `changelog.ts` and `package.json` conflict whenever parallel builds both bumped. Rule:
  - Read master's top entry and `git diff origin/master -- package.json`.
  - Master's version already pushed: the incoming entry gets the next free minor (`new` in it) or patch (fixes only) above master, today's date.
  - Master's top entry unpushed: an unpushed patch fix joins that entry; a `new` change raises it to the next minor.
  - Keep every entry and every line. Top entry's `version` equals `package.json`.
- [ ] Table rows (CLAUDE.md per-app table, `docs/apps/README.md`, `docs/adrs/README.md`, `docs/ROADMAP.md`): keep both sides, in order.
- [ ] Anything else: read both sides, resolve by intent, never take one side blindly. `git cherry-pick --continue`.

## Verify on master

- [ ] `bun run check` — 0 errors.
- [ ] If the group touches `src/lib/core`, `src/lib/kit` or `src/lib/apps/system`: run CI's fork check locally — a scratch `git worktree` with `src/lib/apps/user` deleted, `bun install`, `bun run check`, `bunx vitest run --project browser src/lib/core src/lib/kit src/lib/apps/system`. A core test that needs user apps must skip without them.
- [ ] `bun run test` — green. A video-tools capture failure that passes on one rerun is the known flake; anything else blocks the push.
- [ ] Amending the picked commit for the renumber is fine (it's unpushed): `git add <files> && git commit --amend --no-edit` in one command.

## Push and clean up

- [ ] When the group is complete: full `bun run test`, `git log --oneline origin/master..master`, then `git push origin <last-sha-of-group>:master`.
- [ ] `git worktree remove --force <worktree>` and `git branch -D <branch>`.
- [ ] `git stash pop` if stashed in this merge.
- [ ] Tell every agent still running: "master is now at {version}; rebase before committing" (SendMessage).

## Commit rules (for any commit made here)

- Conventional title (`feat:`, `fix:`, `refactor:`, `docs:`), short bullet body.
- No Co-Authored-By, no mention of AI or Claude.
- Stage and commit in one command; nothing left staged between edits.
