# Release notes and first-run introduction

**Date:** 2026-10-11
**Participants:** Owner, Claude

## Context

The owner wants to hear about new features, changes and fixes. They also want every release listed in Settings, including everything shipped so far, and an introduction the first time someone uses WebOS.

What existed:
- ADR-004 planned a hand-written `CHANGELOG.md` rendered in Settings, and an "update available" toast. Neither was built ([version.md](../system/services/version.md#divergence-from-adr)).
- `package.json` was `0.0.0`. Nothing marked a release.
- VersionService compared `buildTimestamp` only. It had no dependencies and persisted nothing.
- Commit history: 88 commits. Before 2026-10 they're "wip", "fixes" or "adr-017", so they can't be used as user-facing notes.
- ROADMAP "Release notifications" asked: what shows before vs after reload, how seen is tracked, structured or markdown, notification or window.

## Topics

### Round 1

| Question | Decision | Rejected |
|----------|----------|----------|
| Format | Hand-written typed TS module, bundled (`version/changelog.ts`). Kinds `new` / `improved` / `fixed` | `CHANGELOG.md` fetched at runtime (needs a markdown renderer, which means a dependency); generated from `feat:`/`fix:` commits (dev-speak wording, useless backfill) |
| Release unit | A semver bump of `package.json` with a changelog entry. A deploy without a bump announces nothing. History backfilled as grouped retroactive versions 0.1.0 to 0.7.0 | Every deploy (docs-only pushes would announce too); dated entries (same-day releases collide) |
| Agents | A rule in CLAUDE.md: bump `package.json` and write the entry along with user-visible changes | |
| Owner and storage | VersionService, which gains deps files, notifications, dialogs, apps. Seen marker in `/var/lib/version/state.json` | New ChangelogService (more surface for one feature); a field in `/etc/settings.json` (not a setting, and Reset would re-trigger the intro) |

### Round 2

| Question | Decision | Rejected |
|----------|----------|----------|
| First use | A full-screen paged setup assistant, like an OS out-of-box experience. Owner's words: "what to do, how to do, what to expect - genuine os experience". Pages: Hello, Your files, Getting around, Make it yours (theme and taskbar, applied live), Ready. Skip on every page | Centred welcome card; a Welcome app window; toasts only |
| After an update | A toast "Updated to vX" with counts and a "What's new" action, which opens Settings › What's new | A full-screen What's new on every update; a centred card |
| Before the reload | A sticky "A new version is ready" toast with "Update and reload" (the ADR-004 toast, never built) | Settings only |
| Replay | "Show introduction" button in Settings › About | Once only |

Accepted consequences, raised during grilling:
- A user with no state file sees the introduction once, including existing users like the owner, not What's new.
- With two tabs open, the first to boot writes the seen marker, so the second shows nothing.
- At boot the introduction stacks above the Restore dialog. Restore shows once the intro is done.
- Mobile (ADR-016): the takeover is already full-screen, so there's no separate layout.

## Key takeaways

- The changelog is part of the bundle. A tab learns a release's notes only after it reloads into that release, which matches "notes after reload, toast before".
- The seen marker is OS state, not a setting, so it lives in `/var/lib`, like session and desktop layout.

## Action items

- [x] ADR-026
- [x] Implement: changelog, seen state, toasts, intro, Settings › What's new, replay
- [x] CLAUDE.md release rule
- [x] ADR-004 revision, version.md, ROADMAP

## Next session topics

- Whether a fixes-only release should toast at all.
