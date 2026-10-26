# Solo links on a stale build
**Date:** 2026-10-26
**Participants:** owner, Claude

## Context
Owner: "i know we now show the 'update' button but can we somehow prevent it so that it can never happen with porfolio app (at least? ideally for all solo)".

After a deploy the service worker boots the previous build from its precache (`NavigationRoute` on the precached `index.html`), and its app registry and prop schemas are the old ones. `#/solo/portfolio` then reads as an unknown app (or a newer `section` fails the old schema) and `solo-shell.svelte` shows "This link can't open"; since 10-25 a `version.check()` there swaps in the Update screen when a newer build is found. Shells cached before 10-25 have no check. A deploy also replaces every hashed chunk, so a stale shell's lazy app import can 404 (`LoadFailed`, its own update path).

The worker never sees the `#` fragment, so it can't special-case a solo link by hash; special handling needs its own path.

## Topics discussed
### Options (decided: a Portfolio path)
- Solo auto-update: update and reload by itself when the link is broken and a newer build exists, plus reload on `controllerchange`. Recovery, not prevention: a flash and ~2 s reload.
- Network-first navigation for `index.html`: the only "never" while online, but a round trip on every boot and a reversal of ADR-004.
- Version check before solo boot: up to ~1.5 s on every solo boot.
- A Portfolio-only path `/webos/portfolio/` (a copy of `index.html` the worker never caches): fresh build per visit, but not offline, Pages' 10-minute HTTP cache still bites right after a deploy, old hash links stay as they are.
- Keep the previous build's `assets/` on deploy: fixes chunk 404s only.

Owner: "i think this is fine. and just leave the solo handling as is.", then "do the porfrolio path - then we also need to update the link of the /portfolio repo". Generic solo keeps the current check-and-Update screen; Portfolio gets `/webos/portfolio/`.

### Portfolio path (decided)
- `vite-plugin-portfolio-path.ts` copies the built `index.html` to `dist/portfolio/index.html` with one script: a bare visit becomes `#/solo/portfolio`. Skipped when the Portfolio app is missing (fork check).
- Workbox: `globIgnores` and `navigateFallbackDenylist` keep the path out of the worker, so it is always a network load. Not offline.
- `route_url` and the solo shell's Open WebOS use `BASE_URL`, not `location.pathname`, so links made on the path point at the root.
- The `portfolio` repo redirect moves to `/webos/portfolio/`, after this deploy is live.
- Left: GitHub Pages' `max-age=600` can serve the old HTML from the browser cache for up to 10 minutes after a deploy.

## Key takeaways
- A shell already cached in a browser keeps its own behaviour once, whatever ships next.
- Any per-app freshness needs a path, not a hash.

## Action items
- [x] Portfolio path in WebOS (3.70.1).
- [ ] `portfolio` repo: redirect to `https://lilbunnyrabbit.github.io/webos/portfolio/` once 3.70.1 is live.

## Next session topics
- Other solo links: network-first navigation (ADR-004) if they need the same.
