# Build prompt template

The `app-builder` agent already carries the standing rules (read-first list, hard rules, docs duties, checks, commit rules). The prompt only gives the item. Fill every `{…}`; delete lines that don't apply.

```
Build {name} ({kind: new app | feature in {id} | OS feature | fix}).

Decisions: {ADR path} and {brainstorm path}. Both are uncommitted in the main
checkout (/Users/lilbunnyrabbit/dev/orgs/lilbunnyrabbit/webos). Copy them into
your worktree and commit them with the build. Also copy {ADR index row: "| [058](./058-x.md) | Title | YYYY-MM-DD | Accepted |"}
into docs/adrs/README.md.

Scope:
- {what ships in this cut, as decided}
- {what's explicitly out: left for later}

Reuse: {kit pieces, similar apps, files with paths}.
Kit moves: {"move X to $kit/... in its own refactor: commit first" | none}.
Shell: {decided commands / open association / Open with / prop | nothing}.
Mobile: {both | desktop-only | specifics}.
Credit: {meta.ts authors: [{ name: "<requester>", github: "<requester>" }, OWNER] | brainstorm and ROADMAP line "idea from <requester>" | none (owner's own request)}.
App docs: {docs/apps/{id}.md + README row + CLAUDE.md table row | none}.

Changelog: one user-facing line, kind {new | improved | fixed}. Master is at
{version}. Follow the Releases rules in CLAUDE.md; the merger renumbers if
another build lands first.

Test inputs: {scratchpad paths of transcoded videos or photos | none}. Never
copy them into the repo.

Order: {"after X merges, rebase on master" | none}.
```

Fix agents (bug, polish, review screenshots) use the same template with the screenshot paths, the exact symptom, and `kind: fix`; no ADR unless the fix changes shape.
