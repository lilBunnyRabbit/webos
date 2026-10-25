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
- ~~Consent Mode keeps the script loaded without cookies, so declining still counts visits anonymously.~~ Wrong, see the follow-up below.

## Action items
- [x] Owner: create the GA4 web stream for `lilbunnyrabbit.github.io/webos` and send the `G-…` ID.
- [x] Build with one app-builder agent once the ID is in. [ADR-070](../adrs/070-usage-analytics.md).

## Follow-up: counting visits without consent (same day)
Owner: "we cant even track page view without consent? so that i know that X amount of people opened the webpage? just that - and keep the rest of analytics under consent".

Findings:
- GA4 turns cookieless (denied) pings into numbers only through behavioral modeling, which needs about 1,000 denied events a day and 1,000 consented daily users for 7 days. WebOS is far below that, so those pings never show in reports. Only visitors who click Allow are counted; solo opens and everything before the answer are invisible.
- GitHub Pages has no visitor numbers (repo Traffic counts github.com repo views).
- A consent-free count needs a second, cookieless counter (GoatCounter, Cloudflare Web Analytics). Its legal footing rests on national audience-measurement exemptions; GA4 doesn't fit them.

### Visits without consent (decided)
Leave as is: only consented visitors are counted. Rejected: GoatCounter next to GA (second vendor, two dashboards that disagree), GoatCounter only (loses GA and returning visitors), Cloudflare Web Analytics (visits, not people; unclear whether it strips the hash).

### Loading before the answer (decided)
gtag loads only after Allow: `index.html` defines `webos_load_analytics()` and calls it at boot when the mirror says `allowed`; `set_consent("allowed")` calls it mid-session. The pre-answer pings gave nothing at this traffic and were the weakest part legally. Rejected: keep loading always.

### Analytics service (decided)
Owner asked whether analytics should be a service. Today it touches `index.html` (loader), `analytics.ts`, Settings (field + mirror effect), Version (the ask) and Apps (`track_launch`), each 5 to 10 lines, one event, one three-value answer; the loader must stay in `index.html` either way. A service would only pay off with an app `track()` API, which reopens the privacy promise.
- **Shape:** keep the util. The mirror moves into `apply_consent()` so Settings only holds the field. Rejected: `AnalyticsService` with `/var/lib/analytics/state.json` (service plus migration for one field), service plus an app track API (public API change, speculation).
- **Solo:** a solo tab sends `app_open` (`mode: solo`) when the stored answer is already `allowed`; solo never asks. Rejected: skip loading on `#/solo/`.
- **Two tabs:** leave it; another tab stops at its next reload. Rejected: a `storage` listener (patches one field of settings' general last-writer-wins gap).
- **Shell and inspector:** nothing. Rejected: `analytics status|allow|decline`, inspector rows.

## Next session topics
- Which other events are worth it, if any, after a few weeks of data.
