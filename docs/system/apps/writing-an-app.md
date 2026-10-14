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
import { AppCategory } from "$lib/core/api/services/apps/type";
import { FILE_PROPS } from "$lib/core/api/services/apps/helpers";
import { Notepad as NotepadIcon } from "phosphor-svelte";

export default define_app({
  id: "notes",
  name: "Notes",
  icon: NotepadIcon,
  version: "1.0.0",
  category: AppCategory.PRODUCTIVITY,
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
  import { EmptyState, IconButton, Spinner, Toolbar } from "$lib/core/components/ui";
  import { Note as NoteIcon, TextAa as TextAaIcon, X as XIcon } from "phosphor-svelte";
  import { z } from "zod";

  const { path }: { path?: string } = $props();

  const files = $derived(kernel.service<FilesService>("files"));
  const { window: win, storage } = get_app_context();
  const font_size = storage.persisted("font_size", 14, z.number());

  const content = $derived(path ? files.get_file(path).then((file) => file?.text() ?? null) : null);
</script>

<div class="grid h-full grid-rows-[auto_1fr]">
  <Toolbar>
    <span class="min-w-0 flex-1 truncate px-1 font-mono text-2xs text-foreground/80">{path ?? "No file"}</span>
    <IconButton label="Larger text" size="sm" onclick={() => font_size.value++}><TextAaIcon weight="bold" /></IconButton>
    <IconButton label="Close" size="sm" onclick={() => win.close()}><XIcon weight="bold" /></IconButton>
  </Toolbar>

  {#if !content}
    <EmptyState icon={NoteIcon} title="No note open" description="Open a .note file from File Explorer." />
  {:else}
    {#await content}
      <div class="grid place-items-center"><Spinner label="Reading note" /></div>
    {:then text}
      <pre class="overflow-auto p-4 @md:px-8" style:font-size="{font_size.value}px">{text ?? "File not found."}</pre>
    {/await}
  {/if}
</div>
```

What this shows:

- **Every prop is optional.** Start menu launches and default pins pass none; only a shortcut file with `props` passes some. The type system enforces it (`Component<Partial<TProps>>`).
- **Services** through `kernel.service<T>("key")` in `$derived`, never destructured.
- **Context** via `get_app_context()` during init. `window` renamed to keep the global reachable.
- **Per-app settings** with `storage.persisted()`, stored as `app.notes.font_size`. Shared live by every Notes window. Must be called during init.
- **Responsive** with container queries (`@md:`); the window body is the `@container`. No viewport breakpoints.
- **UI kit, not hand-rolled controls.** `Toolbar`, `IconButton` (always with a `label`), `EmptyState` and `Spinner` from `$lib/core/components/ui`, laid out as the document frame from [docs/design/patterns.md](../../design/patterns.md). The Style Guide app shows every component live.
- **Theme tokens only** (`text-foreground/65`, `bg-background-light`); the default Tailwind palette doesn't compile.

## 4. Try it

`bun dev`, open the start menu, click Notes. Pin it to the desktop with the + button. If it handles files, create one in File Explorer and double-click it. `bun run check` must stay at 0 errors.

## Things to know

- **Pause when unseen.** Loops, timers and media derive from `win.is_visible` (minimized or hidden tab → `false`), never `document.hidden` by hand (ADR-035).
- **App data.** Settings and small state: `storage.persisted()`. Anything bigger (entries, boards, history): `storage.file("name.json", initial, schema)` in `/var/lib/apps/{id}/`. Documents the user names and opens: real files in `/home` ([app context](app-context.md#file-adr-035)).
- **Background alerts.** `notify(app_id, { system: true, … })` also reaches the OS while the tab is hidden; call `notifications.request_system()` from a click first.
- **Printing.** `print_html(html, { title })` from `$lib/core/utils/print` prints only that document, through a script-less iframe. "Save as PDF" in the dialog is the PDF path.
- **Images.** `$lib/core/utils/image`: `load_image(file)` / `load_image_at(path)`, `image_files(transfer)` and `has_files(event)` for drops and pastes, `save_image({ … })` (save picker, write, toast) and `write_image(path, canvas | OffscreenCanvas | Blob, { format, quality })`. `write_image` takes the format from the path's extension (then PNG) unless `format` is given, `quality` defaults to 0.92, and JPEG is flattened onto white because it has no alpha. The format tables (`ImageFormat`, `FORMAT_OPTIONS`, `IMAGE_EXTENSIONS`, `extension_for`, `format_of`, `format_for_name`, `has_quality`) live in kernel-free `$lib/core/utils/image-format`, so pure files and Node tests import them from there.
- **Games.** `$lib/core/games`: `format_time(ms, { tenths })`, `Stopwatch` (`new Stopwatch(() => win.is_visible)`: `start`, `pause`, `reset`, `elapsed`, `read`), `track_play(app_id, () => win.is_visible)` for Game Hub's play time (returns `daily(day, ms)` for a solved daily puzzle), `day_key()` and `daily_seed(day, app_id)`. Seeded randomness: `$lib/core/utils/random`.
- **Shell.** Apps add global commands, completers and value types through the manifest's `shell` field ([manifest](manifest.md#shell-adr-034), ADR-034). Before building one, ask the owner how it should reach the terminal and palette: its own commands, a service command (`app launch`, `open` by file type), or a prop the Terminal can pass. See CLAUDE.md, "Shell integration".


| Situation | What happens |
|-----------|--------------|
| Launched with props that fail the schema | Window opens with no props, warning toast, zod issues in the console |
| Component import fails | The window shows an error empty state, "This app failed to load", with the message |
| App throws while rendering, in an effect or a `$derived` | The window shows "This app crashed" with Restart app / Close window, plus an error toast. The OS keeps running. Event-handler errors aren't caught: report those yourself |
| Same app opened twice | Two windows. Shared `persisted()` values, separate component state |
| User closes the window | Immediate unmount; clean up in `$effect` returns or `onDestroy`. There's no close veto |
| Report an error to the user | `kernel.service<NotificationsService>("notifications").notify(app_id, { type: "error", title })` ([notifications](../services/notifications.md)) |
| Ask the user something outside the window | `dialogs.show(Component, props, { anchor })` ([dialogs](../services/dialogs.md)) |
| Need the file's bytes | `files.get_file(path)` returns a `File` or `null` ([files](../services/files.md)) |

References in the repo: `user/example` (context, persisted state, props), `system/text-editor` (file app that saves: close guard, disk watch, window-scoped shortcuts), `system/media-preview` (file app with a toolbar and status bar), `system/settings` (side-nav app with sections), `system/style-guide` (every kit component).
