# App lifecycle

From folder to closed window. Services: [apps](../services/apps.md), [windows](../services/windows.md).

## 1. Discovery

Two paths, one description of an app (ADR-077):

- **Build.** `tooling/vite-plugin-catalogue.ts` loads every `src/lib/apps/{system,user}/*/index.ts` in Node, describes each with `manifest_data()` (`services/apps/catalogue.ts`) and writes `store/catalogue.json` and `store/icons.svg`. Each manifest becomes a chunk of its own (`assets/{id}.manifest-<hash>.js`). Adding an app = adding a folder; no registration.
- **Dev server and tests.** `src/lib/apps/index.ts` globs the same folders eagerly; `glob_source()` runs `manifest_data()` on them. Only `import.meta.env.DEV` code imports it, so a build never bundles it.
- One level deep: `apps/system/{id}/index.ts`, `apps/user/{id}/index.ts`. The folder decides `system`.
- Core tests don't depend on the user apps: `services/apps/test-apps.ts` has `EXAMPLE_APP` (a stand-in `example` app with a `{ count }` schema) and `TestAppsService`, whose source is the system apps plus the stand-ins.

## 2. Registry

`AppsService.init()` registers what the catalogue knows: at boot only the installed apps' entries from `/var/lib/apps/catalogue.json` (the full catalogue on the first boot of a release), each as a stub; the rest once something calls `catalogue()`. Each installed app's manifest chunk loads after first paint and replaces its stub ([apps](../services/apps.md#catalogue-adr-077)). The registry is a `SvelteMap` keyed by `id`; a duplicate id overwrites. The start menu iterates `apps.listings({ installed: true })`.

## 3. Launch

Entry points: start menu (`launch(id)`), desktop shortcut (through `apps.open(path)`, which launches `app_id` with the `.desktop` file's props), desktop folder (`launch("file-explorer", { path })`), `apps.open(path)` (`launch(id, { path })`, or the shortcut's target and props for a `.desktop` file).

`AppsService.launch(id, props?)`:

1. Unknown id → `throw new Error("App {id} not found")`.
   A user app that isn't installed opens without installing (ADR-077).
2. Validates `props` against `manifest.props` ([rules](../services/apps.md#props-validation-adr-008)). When the app's code hasn't landed yet, the window opens first and the props are checked when the manifest loads, before the component renders.
3. Builds the instance (private `instantiate`) and starts the component import: `component()` returns a promise, stored as-is.
4. `windows.open(app_instance)` with `AppInstance = { id, manifest (without component), component: Promise, props?, state }`. `state` is the window's `storage.window()` values: empty on launch, the saved values on restore.

In solo mode (a `#/solo/` link, ADR-047) `SoloAppsService` replaces this: the first launch opens the one window and installs nothing; every later launch opens nothing, focuses that window and toasts "Open WebOS to use other apps" ([apps](../services/apps.md#solo-mode), [solo shell](../shell/solo.md)).

**Session restore** is the other way in. At boot, if the user picks Restore, [SessionService](../services/session.md) loads each saved app's code (`apps.load`), then calls `apps.create_instance(app_id, props)` for each saved window (`null` for an unknown app, code that didn't load or invalid props, silently) and `windows.restore(snapshots, create)`, which inserts the windows with their saved bounds, flags and snap zone instead of the cascade. Skipped windows get one summary toast. Apps with `restore: false` in the manifest are never saved.

## 4. Window

`WindowsService.open()` creates a `WindowInstance` with a uuid, `order = ++max_order` (on top and focused), flags/snap/constraints from `manifest.defaults`, and cascaded 600×400 bounds. It returns the id synchronously; the component may still be loading.

`window-manager/window-manager.svelte` renders one `window.svelte` per window (on mobile, `mobile-windows.svelte` → `mobile-window.svelte`); the frame renders `window-content.svelte` for the body.

## 5. Context and component load

`window.svelte` (and `mobile-window.svelte`, `solo/solo-window.svelte`), during init:

1. Reads `app_id` from the instance once (`untrack`): a window's app never changes and context can only be set during init.
2. `set_app_context({ window_id, app_id, window: create_window_handle(window_id), storage: create_storage_handle(app_id, instance.app.state) })`. Set on the frame, not the content, so the window's sheets share it. See [app-context.md](app-context.md).

`window-content.svelte` then:

3. Wraps the app in `<div class="h-full w-full overflow-auto @container" style:zoom>`. The `@container` is what app `@sm:`/`@md:` queries resolve against.
4. `{#await instance.app.component}`:
   - pending: a centred `Spinner` ("Loading app").
   - resolved: `<Component {...instance.app.props} />` inside `<svelte:boundary>`. A render, effect or `$derived` error shows "This app crashed" with Restart app (`reset()`, remounts) and Close window, logs it and posts an error toast from the app's id. Event-handler errors aren't caught.
   - rejected: an error `EmptyState`, "This app failed to load", with the error message. No notification, no retry.
5. With the `debug` flag, the window's debug `children` render under the app.

## 6. Props

The component gets the validated, parsed object spread as props, or nothing. Props are fixed for the window's life: there's no API to change them after launch. Opening another file means another window.

### Invalid props

The window opens anyway, with no props. The user sees a warning toast "{name} opened without its data", and the console gets the zod issues (or "has no props schema"). The app has to render its no-props state, which it needs anyway for start-menu launches.

## 7. Close

`window.close()` from the app, or the titlebar, calls `WindowsService.close(id)`. A clean window closes at once. A window the app marked dirty (`window.set_dirty(true, { save })`) asks first through a save-changes sheet: Save, Don't save or Cancel, and Cancel keeps it open (ADR-029). `force_close(id)` skips the question. Closing deletes the instance and Svelte unmounts the window: the app's `$effect` cleanups and `onDestroy` run, and `persisted()` cells release their reference (the last window of an app disposes them).

## Multiple instances

Every launch opens a new window. Nothing is single-instance and nothing deduplicates by file: opening the same file twice gives two windows.

Instances of one app share:

- `persisted()` cells: same key = same live value in every window ([app-context.md](app-context.md#shared-persisted-cells)).
- `app.{id}.*` in localStorage.
- Module-level state in the app's own `.svelte`/`.ts` files (ES modules are singletons).

They don't share component state or props.
