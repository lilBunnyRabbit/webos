# Usage analytics
**Date:** 2026-10-25
**Participants:** owner, Claude

## Context
Owner: "do we have any google tracking?" then "Some of my other project do". WebOS had none: no gtag, no analytics, no Google Fonts. The only Google host is `stun.l.google.com` for P2P Transfer while connecting. The owner's other projects (Chromatics, static-utils) paste the plain gtag snippet into `app.html`, with no consent step.

WebOS differs: one URL with hash routes, so page views alone don't show which apps get used; it runs offline (gtag just doesn't send); and the EU's rules need consent before GA's cookies.

## Decisions
- **What:** a page view on load, plus an `app_open` event per launch with `app_id`, `mode` (`desktop` / `solo`) and `platform` (`desktop` / `mobile`). Nothing else: no file names, paths, shell commands or props. Rejected: visits only (says nothing about apps), shell and file events (noise, privacy).
- **Consent:** GA Consent Mode with `analytics_storage` and `ad_storage` `denied` by default, so GA sends cookieless pings until the visitor accepts. WebOS asks once; the answer is kept in `/etc/settings.json` and can be changed in Settings. Rejected: always cookieless (no returning visitors), the plain snippet (not compliant for EU visitors).
- **Property:** a new GA4 web stream for WebOS; the owner creates it and supplies the `G-…` ID. Rejected: reusing the Chromatics or static-utils IDs (mixed reports).
- **Home:** the gtag snippet and consent default in `index.html`; `src/lib/core/utils/analytics.ts` with `track_launch()`, called from `AppsService.launch`; a "Share usage stats" switch in Settings. No new service. Shell: nothing. Rejected: an AnalyticsService (a service for one script tag), shell commands.
- **The ask** (picked by Claude, per the owner's standing "design calls: no ask"): a sticky notification with Allow and No thanks, shown once after the Restore answer and the first-boot introduction, like new-app announcements. Dismissing it without an answer asks again next boot.

## Key takeaways
- Launch events are the whole point; page views on a hash-routed OS are near empty.
- Consent Mode keeps the script loaded without cookies, so declining still counts visits anonymously.

## Action items
- [x] Owner: create the GA4 web stream for `lilbunnyrabbit.github.io/webos` and send the `G-…` ID.
- [x] Build with one app-builder agent once the ID is in. [ADR-070](../adrs/070-usage-analytics.md).

## Next session topics
- Which other events are worth it, if any, after a few weeks of data.
