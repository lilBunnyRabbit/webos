# Releases in Discord
**Date:** 2026-10-21
**Participants:** owner, Claude

## Context
Owner: "i want the new releases to also show in a specific discord channel. Possibly with what changed. Probably with github actions webhook."

Today: `deploy.yml` deploys every push to `master`; `changelog.ts` holds every release (126 entries), newest first; one push often carries several versions; the only git tag was `v1.0.0`; no GitHub Releases. `bun` can import `changelog.ts` directly in CI.

## Decisions
- **Marker: a git tag per version.** After the deploy succeeds, the `announce` job posts every entry newer than the latest `v*` tag (oldest first), then tags the newest version. Re-runs are safe, several versions in one push all post, a failed or cancelled run retries on the next push. Seeded with `v3.26.0` so history doesn't flood the channel. Rejected: diffing `package.json` against the previous push (a cancelled run loses the post, manual runs have no `before`); GitHub Releases plus Discord's GitHub webhook (no formatting control).
- **Message: one embed per release.** Title `{title} · v{version}` linking to What's new (`#/app/settings?section=whats-new`), lines grouped New / Improved / Fixed, date in the footer, brand green. No pings (`allowed_mentions` empty). Up to 10 embeds per message.
- **No third-party action, no dependency:** `scripts/discord-release.ts` with `fetch`; the webhook URL is the repo secret `DISCORD_WEBHOOK_URL`. Without it the job prints the embeds and tags nothing.

## Owner to do
1. Discord: channel settings › Integrations › Webhooks › New webhook, copy its URL.
2. GitHub: repo Settings › Secrets and variables › Actions › New secret `DISCORD_WEBHOOK_URL`.

## Next session topics
- A role ping for opt-in notifications
- An announcement channel others can Follow
