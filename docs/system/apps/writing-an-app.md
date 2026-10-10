# Writing an app

The short path from nothing to a window. Details live in [manifest.md](manifest.md), [lifecycle.md](lifecycle.md), [app-context.md](app-context.md) and [file-associations.md](file-associations.md). Code rules: [CONVENTIONS](../../CONVENTIONS.md).

## 1. Make the folder

```
src/lib/apps/user/notes/        # or system/ for a bundled OS app
├── index.ts                    # manifest, loaded eagerly
└── notes.app.svelte            # component, loaded on launch
```

The folder must sit directly under `system/` or `user/`; deeper folders aren't discovered. No registration step: the glob picks it up on the next build or HMR reload.

## 2. Write the manifest

```ts
// index.ts
import { define_app } from "$lib/core/api";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { Notepad as NotepadIcon } from "phosphor-svelte";

export default define_app({
  id: "notes",
  name: "Notes",
  icon: NotepadIcon,
  version: "1.0.0",
  categories: ["user"],
  associations: [".note"],
  props: FILE_PROPS,
  defaults: { constraints: { width: { min: 320 }, height: { min: 240 } } },
  component: () => import("./notes.app.svelte"),
});
```

- `id` must be unique; a clash silently replaces the other app.
- From `$lib/core/api`, import only types and functions. Constants come from their own module ([why](manifest.md#the-import-rule)).
- Skip `associations` and `props` if the app doesn't open files. Without a `props` schema the app never receives props.

## 3. Write the component

```svelte
<!-- notes.app.svelte -->
<script lang="ts">
  import kernel, { type FilesService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { z } from "zod";

  const { path }: { path?: string } = $props();

  const files = $derived(kernel.service<FilesService>("files"));
  const { window: win, storage } = get_app_context();
  const font_size = storage.persisted("font_size", 14, z.number());

  const content = $derived(path ? files.get_file(path).then((file) => file?.text() ?? null) : null);
</script>

<div class="grid grid-rows-[auto_1fr] h-full">
  <header class="flex gap-2 px-3 py-2 border-b border-b-foreground/20 text-sm">
    <span class="font-mono truncate text-foreground/65">{path ?? "No file"}</span>
    <button class="hover:opacity-85" onclick={() => font_size.value++}>A+</button>
    <button class="hover:opacity-85" onclick={() => win.close()}>Close</button>
  </header>

  {#if !content}
    <p class="p-4 text-foreground/65">Open a .note file from File Explorer.</p>
  {:else}
    {#await content then text}
      <pre class="p-4 @md:px-8" style:font-size="{font_size.value}px">{text ?? "File not found."}</pre>
    {/await}
  {/if}
</div>
```

What this shows:

- **Every prop is optional.** Start menu and desktop launches pass none. The type system enforces it (`Component<Partial<TProps>>`).
- **Services** through `kernel.service<T>("key")` in `$derived`, never destructured.
- **Context** via `get_app_context()` during init. `window` renamed to keep the global reachable.
- **Per-app settings** with `storage.persisted()`, stored as `app.notes.font_size`. Shared live by every Notes window. Must be called during init.
- **Responsive** with container queries (`@md:`); the window body is the `@container`. No viewport breakpoints.
- **Theme tokens only** (`text-foreground/65`, `border-foreground/20`); the default Tailwind palette doesn't compile.

## 4. Try it

`bun dev`, open the start menu, click Notes. Pin it to the desktop with the + button. If it handles files, create one in File Explorer and double-click it. `bun run check` must stay at 0 errors.

## Things to know

| Situation | What happens |
|-----------|--------------|
| Launched with props that fail the schema | Window opens with no props, warning toast, zod issues in the console |
| Component import fails | The window shows `Error loading component: …` |
| Same app opened twice | Two windows. Shared `persisted()` values, separate component state |
| User closes the window | Immediate unmount; clean up in `$effect` returns or `onDestroy`. There's no close veto |
| Report an error to the user | `kernel.service<NotificationsService>("notifications").notify(app_id, { type: "error", title })` ([notifications](../services/notifications.md)) |
| Ask the user something outside the window | `dialogs.show(Component, props, { anchor })` ([dialogs](../services/dialogs.md)) |
| Need the file's bytes | `files.get_file(path)` returns a `File` or `null` ([files](../services/files.md)) |

References in the repo: `user/example` (context, persisted state, props), `system/text-viewer` (smallest file app), `system/media-preview` (file app with a toolbar).
