# RouterService

Key `router` · Depends on: windows, apps, session, clipboard, notifications · ADR: [ADR-010](../../adrs/010-url-deep-linking.md), [ADR-047](../../adrs/047-solo-app-open.md) · Source: `src/lib/core/api/services/router/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Deep links. A URL like `/webos/#/app/settings?section=about` opens that app with those props, after the session's Restore question. A solo link `#/solo/{id}?{props}` opens the app alone, full page (ADR-047). A window can copy either link to itself from its titlebar. Only app and solo links exist: file links, workspaces and demo presets are deferred ([brainstorm](../../brainstorm/2026-10-14_deep-linking.md)), because almost every app's props are an OPFS path the receiving machine doesn't have.

## Link format

`#/app/{id}?{key}={value}&…` or `#/solo/{id}?…`, handled by `route.ts` (pure, unit tested). `Route.kind` is `RouteKind.APP` or `RouteKind.SOLO`:

| Function | Does |
|----------|------|
| `parse_hash(hash)` | `Route \| null`. `null` for anything that isn't `#/app/{id}` or `#/solo/{id}` (empty, other prefixes, a `/` in the id, bad percent-encoding). Each query value is `JSON.parse`d and falls back to the raw string, so `count=3` is `3` and `section=about` is `"about"`. A string that looks like JSON (`"3"`, `"true"`) can't be expressed. No query means `props: undefined` |
| `serialize_route(route)` | The inverse, prefix by `kind`: strings raw, everything else `JSON.stringify`, `URLSearchParams` encoding, no `?` without props |
| `route_url(route)` | `origin + pathname + serialize_route(route)` |
| `shareable_props(props)` | `{ props, dropped }`: the launch props without device paths (`path`, `paths`, `left`, `right`, or any string or string array starting with `/`). Owner, 2026-10-15: every window gets Copy link; a file window links to its app without the file |

Props aren't validated here; the app's schema decides in the service.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `last_link` | `readonly { hash, outcome } \| null` | The last `#/…` hash handled in this tab. `outcome`: `opened`, `not a link`, `unknown app`, `invalid props` |
| `link_for` | `(id: WindowId, kind = RouteKind.APP) => string \| null` | `route_url` of `#/app/{id}?{props}` (or `#/solo/…` for `RouteKind.SOLO`) from the window's **launch props** (not its current state: Settings opened on About and moved to Appearance still links About). Props go through `shareable_props`, so a file window links to its app without the file (PDF Tools on Sign: `#/app/pdf-tools?section=sign`). `null` only for an unknown window. Drops `location.search`, so `?platform=` isn't shared |
| `copy_link` | `(id: WindowId, kind = RouteKind.APP) => Promise<void>` | `clipboard.copy_text(link)` then an `info` toast "Link copied" ("Solo link copied") with the URL, titled "Link copied · the open file isn't included" when props were left out. A failed write toasts an error. No-op when `link_for` is `null` |

## Handling a link

`consume()` runs from an effect on the session's `status`, and on `hashchange` unless the page is in solo mode or the new hash is a solo link: those reload, because the services were picked for the mode at boot (ADR-047). `kernel.mode` is solo exactly when the boot hash was `#/solo/`.

1. Session `status` is `pending` (Restore dialog open): do nothing. The effect runs again on the answer, so the link opens **on top of** the restored windows. With nothing saved, `status` is `none` during `init()` and the link opens before the shell mounts.
2. Hash doesn't start with `#/`: left alone.
3. In full mode `history.replaceState` removes the hash (keeping `search`), so a reload doesn't open it again. A solo hash stays, so a reload reopens the app.
4. Not an app link: error toast "This link isn't one WebOS knows".
5. Unknown app id: error toast "The link points to an app that doesn't exist".
6. Props given and the app has no schema, or they fail it: error toast "The link to {name} is broken". **Nothing opens.** That's stricter than `apps.launch()`, which opens the app without its data.
7. Otherwise `apps.launch(id, props)`. On mobile that brings the app on screen like any launch.

Toasts come from the `router` sender, shown as "System".

## State

`last_link`: `$state`. Nothing persisted.

## Lifecycle

| Hook | Does |
|------|------|
| `init()` | `hashchange` listener, and an `$effect.root` that calls `consume()` whenever the session status isn't `pending` |
| `destroy()` | Removes the listener, disposes the effect |

## Who reads it

| Where | How |
|-------|-----|
| `window/window-titlebar.svelte` | Copy link button, shown when `link_for(id)` isn't `null`; opens a menu: Copy link / Copy solo link ([window](../shell/window.md#titlebar)) |
| `solo/solo-shell.svelte` | `last_link` for the broken-link state, `link_for` for Open WebOS ([solo](../shell/solo.md)) |
| `apps/solo.svelte.ts` | `route_url` + `shareable_props` for the Open WebOS toast action |
| Forms `link.ts` | Shared forms are solo links; answer links stay app links |

## Shell

Contributes `link [id] [-c] [-s]` (`router/shell.ts`); `--solo` / `-s` builds the solo link. See [shell](shell.md#contributions).

## Known gaps

- Nothing to share from on mobile: there's no titlebar.
- Links carry launch props only. An app that keeps its view in `storage.window()` state shares where it started.
- No QR code, no share dialog, no `navigator.share`.
