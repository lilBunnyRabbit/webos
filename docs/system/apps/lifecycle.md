# App lifecycle

From folder to closed window. Services: [apps](../services/apps.md), [windows](../services/windows.md).

## 1. Discovery

`src/lib/apps/index.ts`:

```ts
const modules = import.meta.glob<{ default: AppManifest }>(["./system/*/index.ts", "./user/*/index.ts"], { eager: true });
export const apps: AppManifest[] = Object.values(modules).map((m) => m.default);
```

- Vite resolves the glob at build time. Adding an app = adding a folder; no registration.
- One level deep: `apps/system/{id}/index.ts`, `apps/user/{id}/index.ts`. `apps/system/index.ts` and `apps/user/index.ts` exist but are empty and not matched.
- Eager: every manifest module runs when `$lib/apps` is first imported, which is during kernel construction. The `.app.svelte` files are not loaded; each is behind its `component` dynamic import.
- Manifest evaluation happens inside a circular import of `$lib/core/api`, hence [the import rule](manifest.md#the-import-rule).

## 2. Registry

The `AppsService` constructor calls `register()` for each manifest in glob order (system before user, alphabetical within). The registry is a `SvelteMap` keyed by `id`; a duplicate id overwrites. The start menu iterates `apps.list()`.

## 3. Launch

Entry points: start menu (`launch(id)`), desktop icon (`launch(app_id, item.props)`), `apps.open(path)` (`launch(id, { path })`).

`AppsService.launch(id, props?)`:

1. Unknown id → `throw new Error("App {id} not found")`.
2. Starts the component import: `component()` returns a promise, stored as-is.
3. Validates `props` against `manifest.props` ([rules](../services/apps.md#props-validation-adr-008)).
4. `windows.open(app_instance)` with `AppInstance = { id, manifest (without component), component: Promise, props? }`.

## 4. Window

`WindowsService.open()` creates a `WindowInstance` with a uuid, `order = ++max_order` (on top and focused), flags/snap/constraints from `manifest.defaults`, and cascaded 600×400 bounds. It returns the id synchronously; the component may still be loading.

`os.svelte` renders each window; `window.svelte` renders `window-content.svelte` for the body.

## 5. Context and component load

`window-content.svelte`, during init:

1. Reads `app_id` from the instance once (`untrack`): a window's app never changes and context can only be set during init.
2. `set_app_context({ window_id, app_id, window: create_window_handle(window_id), storage: create_storage_handle(app_id) })`. See [app-context.md](app-context.md).
3. Wraps the app in `<div class="h-full w-full overflow-auto @container" style:zoom>`. The `@container` is what app `@sm:`/`@md:` queries resolve against.
4. `{#await instance.app.component}`:
   - pending: "Loading..." centred.
   - resolved: `<Component {...instance.app.props} />`.
   - rejected: the text `Error loading component: {error}` in the window. No notification, no retry.
5. With the `debug` flag, the window's debug `children` render under the app.

## 6. Props

The component gets the validated, parsed object spread as props, or nothing. Props are fixed for the window's life: there's no API to change them after launch. Opening another file means another window.

### Invalid props

The window opens anyway, with no props. The user sees a warning toast "{name} opened without its data", and the console gets the zod issues (or "has no props schema"). The app has to render its no-props state, which it needs anyway for start-menu launches.

## 7. Close

`window.close()` from the app, or the titlebar, calls `WindowsService.close(id)`, which deletes the instance. Svelte unmounts the window: the app's `$effect` cleanups and `onDestroy` run, and `persisted()` cells release their reference (the last window of an app disposes them). There's no veto or "unsaved changes" hook; closing is immediate.

## Multiple instances

Every launch opens a new window. Nothing is single-instance and nothing deduplicates by file: opening the same file twice gives two windows.

Instances of one app share:

- `persisted()` cells: same key = same live value in every window ([app-context.md](app-context.md#shared-persisted-cells)).
- `app.{id}.*` in localStorage.
- Module-level state in the app's own `.svelte`/`.ts` files (ES modules are singletons).

They don't share component state or props.
