# RouterService

Key `router` · Depends on: windows, apps, session, clipboard, notifications · ADR: [ADR-010](../../adrs/010-url-deep-linking.md) · Source: `src/lib/core/api/services/router/` · Inspector: `inspector.svelte` (ADR-020)

## Purpose

Deep links. A URL like `/webos/#/app/settings?section=about` opens that app with those props, after the session's Restore question. A window can copy a link to itself from its titlebar. Only app links exist: file links, workspaces, demo presets and embed mode are deferred ([brainstorm](../../brainstorm/2026-10-14_deep-linking.md)), because almost every app's props are an OPFS path the receiving machine doesn't have.

## Link format

`#/app/{id}?{key}={value}&…`, handled by `route.ts` (pure, unit tested):

| Function | Does |
|----------|------|
| `parse_hash(hash)` | `Route \| null`. `null` for anything that isn't `#/app/{id}` (empty, other prefixes, a `/` in the id, bad percent-encoding). Each query value is `JSON.parse`d and falls back to the raw string, so `count=3` is `3` and `section=about` is `"about"`. A string that looks like JSON (`"3"`, `"true"`) can't be expressed. No query means `props: undefined` |
| `serialize_route(route)` | The inverse: strings raw, everything else `JSON.stringify`, `URLSearchParams` encoding, no `?` without props |
| `is_shareable(manifest)` | `false` when the props schema is a `z.object` with a `path` key (`FILE_PROPS` and anything like it) |

Props aren't validated here; the app's schema decides in the service.

## Public API

| Member | Signature | Notes |
|--------|-----------|-------|
| `last_link` | `readonly { hash, outcome } \| null` | The last `#/…` hash handled in this tab. `outcome`: `opened`, `not a link`, `unknown app`, `invalid props` |
| `link_for` | `(id: WindowId) => string \| null` | `origin + pathname + #/app/{id}?{props}` from the window's **launch props** (not its current state: Settings opened on About and moved to Appearance still links About). `null` for an unknown window or an app that isn't shareable. Drops `location.search`, so `?platform=` isn't shared |
| `copy_link` | `(id: WindowId) => Promise<void>` | `clipboard.copy_text(link)` then an `info` toast "Link copied" with the URL. A failed write toasts an error. No-op when `link_for` is `null` |

## Handling a link

`consume()` runs on `hashchange` and from an effect on the session's `status`:

1. Session `status` is `pending` (Restore dialog open): do nothing. The effect runs again on the answer, so the link opens **on top of** the restored windows. With nothing saved, `status` is `none` during `init()` and the link opens before the shell mounts.
2. Hash doesn't start with `#/`: left alone.
3. `history.replaceState` removes the hash (keeping `search`), so a reload doesn't open it again.
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
| `window/window-titlebar.svelte` | Copy link button, shown when `link_for(id)` isn't `null` ([window](../shell/window.md#titlebar)) |

## Shell

Contributes `link [id] [-c]` (`router/shell.ts`). See [shell](shell.md#contributions).

## Known gaps

- Nothing to share from on mobile: there's no titlebar.
- Links carry launch props only. An app that keeps its view in `storage.window()` state shares where it started.
- No QR code, no share dialog, no `navigator.share`.
