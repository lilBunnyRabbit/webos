<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import kernel, { type FilesService, type NotificationsService } from "$lib/core/api";
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import { join_path, split_path } from "$lib/core/api/services/files/path";
  import { EmptyState, Spinner } from "../ui";
  import { WarningCircle as WarningCircleIcon } from "phosphor-svelte";
  import FileExplorerNavigation from "./file-explorer-navigation.svelte";
  import FileExplorerPlaces from "./file-explorer-places.svelte";
  import FileList from "./file-list.svelte";
  import FileExplorerStatusBar from "./file-explorer-status-bar.svelte";
  import { report_file_error } from "./file-explorer.errors";
  import type { PickerMode } from "./picker";
  import FilePickerFooter from "./file-picker-footer.svelte";

  let { path = PATHS.home, picker }: { path?: string; picker?: PickerMode } = $props();

  let selected = $state<string | null>(null);

  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let handler: DirectoryHandler | null = $state(null);
  /** Folders visited before this one, for Back. They keep watching, so going back shows them fresh. */
  let history: DirectoryHandler[] = $state([]);
  let search = $state("");
  let destroyed = false;

  const can_go_back = $derived(history.some((previous) => previous.exists));

  // The start folder is read once; navigating afterwards is the explorer's own state.
  const init_promise = untrack(() => files.directory(split_path(path))).then(show);

  function show(next: DirectoryHandler) {
    if (destroyed) return next.dispose();
    handler = next;
    search = "";
    selected = null;
  }

  function navigate_to(next: DirectoryHandler) {
    if (handler) history = [...history, handler];
    show(next);
  }

  function navigate_path(segments: string[]) {
    files
      .directory(segments)
      .then(navigate_to)
      .catch((error) => report_file_error(`Could not open /${segments.join("/")}`, error));
  }

  function navigate_back() {
    const alive = history.filter((previous) => previous.exists);
    const previous = alive.pop();
    if (!previous) return;
    handler?.dispose();
    history = alive;
    show(previous);
  }

  // Deleted or moved in another window: fall back to the nearest folder that still exists.
  $effect(() => {
    const current = handler;
    if (current && !current.exists) untrack(() => leave(current));
  });

  async function leave(gone: DirectoryHandler) {
    let segments = gone.segments.slice(0, -1);
    while (segments.length > 0 && !(await files.get_directory(join_path(segments)))) segments = segments.slice(0, -1);

    const next = await files.directory(segments);
    if (handler !== gone) return next.dispose();
    show(next);
    notifications.notify("file-explorer", {
      type: "info",
      title: `"${gone.name}" was moved or deleted`,
      message: `Showing ${next.path} instead.`,
    });
  }

  onDestroy(() => {
    destroyed = true;
    handler?.dispose();
    for (const previous of history) previous.dispose();
  });
</script>

{#await init_promise}
  <div class="grid h-full place-items-center"><Spinner label="Opening folder" /></div>
{:then}
  {#if handler}
    <div class="grid h-full grid-rows-[auto_1fr_auto] overflow-hidden">
      <FileExplorerNavigation {handler} {can_go_back} bind:search onback={navigate_back} onnavigatepath={navigate_path} />

      <div class="flex min-h-0">
        <FileExplorerPlaces current={handler.path} onnavigatepath={navigate_path} />
        <FileList {handler} bind:search bind:selected {picker} onnavigate={navigate_to} />
      </div>

      {#if picker}
        <FilePickerFooter {handler} {picker} {selected} />
      {:else}
        <FileExplorerStatusBar {handler} {files} />
      {/if}
    </div>
  {/if}
{:catch error}
  <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't open this folder" description={error?.message ?? "Unknown error"} />
{/await}
