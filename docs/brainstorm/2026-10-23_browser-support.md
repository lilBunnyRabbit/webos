# Browser support check
**Date:** 2026-10-23
**Participants:** owner, Claude

## Context
Owner: "in webos we use a lot of web api's that are not that widely supported. do an in depth pass of what we use and lets prepare a screen that detects the browser and version of device and we then present a warning screen stating what probably wont work. also include in the agent docs to update this list if anything new is ever added". Mid-session: "on thing that comes to mind is the popover api (if we still use it)".

Today: no browser check. `index.html` loads `src/main.ts`; a throw in any service `init()` aborts `kernel.init()` and `show_boot_error` (`main.ts`) prints "WebOS failed to start: <message>". The only UA sniffing is `utils/install.ts` (install hints) and `kernel/platform.ts` (shell pick).

Two investigate-only passes (MDN browser-compat-data 8.1.7, 2026-10-22):
- **Boot:** `requestIdleCallback` unguarded in `AppsService.init()` and OfflineService (Safari/iOS don't ship it, so they likely can't boot); `createWritable` on first boot (Safari 26); OPFS, Web Locks, BroadcastChannel (scheduler init).
- **Shell:** anchor positioning (every menu, dialog, start menu; Firefox 147, Safari 26), Popover API (start menu, notification centre, terminal completion; Chrome 114, Firefox 125, Safari 17), `closedby` (Safari: no outside-click dismissal), relative colour + `abs()` (theme presets; Chrome 138), `color-mix`/`oklch`/`light-dark()`, container queries, `:has()`, `inert`, `dvh`.
- **Apps:** built-in AI (alibi, ask, unsaid, doodlehop; warren and shopping-list partial), ImageDecoder (gif-player, hopsprite), VideoEncoder (birdseye export, video-tools), WebHID, EyeDropper, BarcodeDetector 1D (cards), `captureStream` (soundboard), canvas `ctx.filter` (image-editor: Safari silently drops adjustments on export), WebAuthn PRF, `caretPositionFromPoint`, Custom Highlights, `plaintext-only`, `field-sizing`, `corner-shape`, `getCoalescedEvents`, WebP encoding. About 45 apps use nothing notable.
- Practical minimums: Chrome 138, Firefox 147, Safari 26 (after the idle-callback fix).

## Topics discussed
### Detection (decided: probes decide, versions in text)
Each entry has a `probe()` that decides whether it's missing, plus `min: { chrome, firefox, safari }` so the screen can say "Update to Safari 26". The UA only names the browser on screen. Rejected: UA + version table alone (UA strings lie: iOS Chrome is WebKit; table goes stale).

### Version check (decided, owner follow-up)
Owner: "The check should check for versions aswell. for example the popover api is supported but still quite new. we need to guard that aswell to a degree that makes sense". A passing probe isn't enough: early versions of a feature miss parts WebOS uses. `min` is the version where the feature works as WebOS uses it; a present feature on an older engine version is `outdated` ("may misbehave"), shown on the screen like a missing one but softer. iOS browsers are WebKit and judged by the iOS version. Unrecognised engines fall back to probes only.

### Gate (decided: tiny pre-boot entry, plain DOM)
`index.html` loads a tiny `src/boot.ts`: runs probes, then `import("./main")` or draws the warning in plain DOM (no Svelte, no shell: those may be the broken part). A browser that can't parse the main bundle still gets the screen. Buttons: Continue anyway, Don't show again. Rejected: check inside `main.ts` (a parse failure leaves a frozen splash); post-boot dialog (relies on anchor positioning and popover).

### Dismissal (decided: missing ids in localStorage)
`webos.compat.dismissed` holds the sorted missing ids; the screen comes back only when something new is missing. localStorage because OPFS may be the missing part. Rejected: browser + version (re-shows on every browser update, misses new WebOS requirements).

### Levels (decided: everything)
The screen lists every missing feature, cosmetic ones too, grouped: Won't start, Shell, Apps, Cosmetic. Rejected: hiding cosmetic ones from the screen.

### List home (decided: one central module)
`src/lib/core/compat/features.ts` holds every entry; app impact as app ids. A test checks every referenced app id exists. Rejected: per-app manifest `requires` (changes stable `define_app`, every manifest read).

### Solo scope (decided, owner addition during the build)
Owner: "solo should focus on just that app, full webos should show the rest (all)". In `#/solo/{id}` the screen and the dismissal check look only at `start` entries and the entries naming that app; shell, cosmetic and other apps' entries are ignored. The header names the app. One dismissal key, so a solo dismissal never hides new full-WebOS issues (solo adds its ids to the set, full WebOS replaces it). Settings › About and `compat` stay full-list. An app with no entries (the portfolio app) shows nothing beyond start blockers.

### Ways in (decided)
- Settings › About: browser label and the support list, with a way to show the screen again.
- `compat` shell command yielding a `columns` table (feature, level, status, impact).
- Launcher dimming: no.

### Unguarded calls (decided: fix all, after the screen ships)
Owner: "after we do this and push it. fix all and push." Separate release after the compat release. All of them, including image-editor's `ctx.filter` done by hand where unsupported, the `requestIdleCallback` boot fix, "Save to disk" pickers, p2p Share, ImageDecoder checks, `caretPositionFromPoint` and `getCoalescedEvents` fallbacks, Moonrabbit's WebP label, cards' 1D barcodes without BarcodeDetector where feasible.

## Key takeaways
- Safari probably can't boot today; the screen ships first, the fixes right after.
- The list is the contract: any new web API or CSS feature gets an entry in the same commit (CLAUDE.md rule).

## Action items
- [x] ADR-067, build the gate, list, screen, Settings › About, `compat` command, CLAUDE.md rule, docs/system page. Push (3.60.0).
- [ ] Fix every unguarded call found. Push (3.60.1).

## Next session topics
- Real Safari / iOS / Firefox runs (none checked yet).
- Picked while the owner was away: the `compat` command is contributed by the shell's core commands (no new service); revisit if a service should own it.
