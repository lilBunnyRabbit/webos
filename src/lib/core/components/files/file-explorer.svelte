<script lang="ts">
  import { untrack } from "svelte";
  import kernel, { type FilesService } from "$lib/core/api";
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import { split_path } from "$lib/core/api/services/files/path";
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

  let handler: DirectoryHandler | null = $state(null);
  /** Folders visited before this one, for Back. The breadcrumb shows the real path instead. */
  let history: DirectoryHandler[] = $state([]);
  let search = $state("");

  // The start folder is read once; navigating afterwards is the explorer's own state.
  const init_promise = untrack(() => files.directory(split_path(path))).then((start) => (handler = start));

  function navigate_to(next: DirectoryHandler) {
    if (handler) history = [...history, handler];
    handler = next;
    search = "";
    selected = null;
  }

  function navigate_path(segments: string[]) {
    files
      .directory(segments)
      .then(navigate_to)
      .catch((error) => report_file_error(`Could not open /${segments.join("/")}`, error));
  }

  // Folders in history aren't watched; their contents may have changed since we left them.
  function navigate_back() {
    const previous = history.at(-1);
    if (!previous) return;
    history = history.slice(0, -1);
    handler = previous;
    search = "";
    previous.reload().catch((error) => report_file_error(`Could not open ${previous.path}`, error));
  }
</script>

{#await init_promise}
  <div class="grid h-full place-items-center"><Spinner label="Opening folder" /></div>
{:then}
  {#if handler}
    <div class="grid h-full grid-rows-[auto_1fr_auto] overflow-hidden">
      <FileExplorerNavigation {handler} can_go_back={history.length > 0} bind:search onback={navigate_back} onnavigatepath={navigate_path} />

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
