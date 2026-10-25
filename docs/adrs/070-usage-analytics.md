# ADR-070: Usage analytics with consent
**Date:** 2026-10-25
**Status:** Implemented

## Context
WebOS sends no usage data, so there's no way to tell which apps get used. The owner's other projects use Google Analytics (gtag) with the plain snippet. WebOS is one URL with hash routes (`#/app/{id}`, `#/solo/{id}`), runs offline, and has EU visitors, whose rules need consent before analytics cookies. Brainstorm: [2026-10-25_analytics](../brainstorm/2026-10-25_analytics.md).

## Decision
- **Google Analytics 4** through gtag, loaded from `index.html` with a WebOS-only measurement ID. The ID is a constant, not a secret.
- **Consent Mode.** Before gtag's `config`, `gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" })`. GA sends cookieless pings until consent. When the stored answer is "allowed", `index.html` reads it before `config` and updates `analytics_storage` to `granted` (ads stay denied).
- **Events.** The automatic page view, plus `app_open` with `app_id`, `mode` (`desktop` | `solo`) and `platform` (`desktop` | `mobile`) on every `AppsService.launch`. No paths, file names, props or command text ever leave.
- **Code.** `src/lib/core/utils/analytics.ts`: `track_launch()`, `set_consent()`; a no-op when gtag is missing (tests, offline, blocked). No new service.
- **Persistence.** `analytics: "unasked" | "allowed" | "declined"` in `/etc/settings.json` through SettingsService. `index.html` reads the answer from a mirrored `localStorage` key, because OPFS isn't readable before gtag's first call.
- **The ask.** A sticky notification with Allow and No thanks, once, after the Restore answer and the first-boot introduction. No answer: asked again next boot. Settings has a "Share usage stats" switch.
- **Shell.** Nothing.

## Alternatives Considered
- Page views only: on a hash-routed OS every visit reads `/webos/`.
- The plain snippet with no consent: what the other projects do; not compliant for EU visitors.
- Always cookieless with no prompt: no ask, but no returning-visitor numbers.
- An `AnalyticsService` with an inspector: a service for one script tag and one event.
- Reusing another project's ID: mixed reports.

## Consequences
- A third-party script on every load; blocked by ad blockers, which is fine.
- One more first-visit prompt.
- `docs/system/services/settings.md` and `apps.md` document the field and the launch hook.

## Revision 2026-10-25 (build)
- **ID.** `G-YZEVME6886`, the WebOS web stream the owner created; a literal in `index.html`.
- **Dev and local runs send nothing.** The `index.html` script returns before defining `gtag` when Vite's `%DEV%` is `true` or the host is `localhost`, `127.0.0.1` or `[::1]`, so dev, `vite preview` and the browser tests never reach the property; `analytics.ts` no-ops without `gtag`.
- **Page location.** `config` gets `page_location: origin + pathname`: the hash and query can hold app props and file paths (`#/app/{id}?path=…`), so they never leave.
- **`mode`.** The kernel's `full` mode is sent as `desktop`, as the decision names it.
- **Where the ask lives.** VersionService, which already sequences the boot prompts: the intro, then its after-Restore effect (the one new-app announcements use, now a shared private `after_restore()`). VersionService gains `settings` as a dependency. Solo never asks because `SoloVersionService.init()` does nothing; solo launches are not tracked (see the next revision).
- **Settings.** The switch sits on Settings › About under its own "Usage stats" heading; `unasked` shows as off, and flipping it records `allowed` or `declined`. Reset settings leaves the answer alone.

## Revision 2026-10-25: load only after Allow
Consent Mode's cookieless pings only become report numbers through behavioral modeling, whose thresholds WebOS doesn't reach, so unconsented visits were never counted while the pings still went out ([brainstorm](../brainstorm/2026-10-25_analytics.md#follow-up-counting-visits-without-consent-same-day)). The owner chose to stop them rather than add a consent-free counter. `index.html` now defines `webos_load_analytics()`, which creates `gtag` once (consent default: `analytics_storage` granted, ads denied; then `js`, `config`, the script), and calls it only when the mirror says `allowed`. `set_consent("allowed")` calls the loader mid-session; any other answer sets an already loaded gtag's `analytics_storage` to denied, and the next load doesn't load it. Unasked, declined and solo visitors send nothing.
