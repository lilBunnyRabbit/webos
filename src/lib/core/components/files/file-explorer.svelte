<script lang="ts">
  import { onDestroy, untrack } from "svelte";
  import kernel, { MountState, type FilesService, type NotificationsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import type { DirectoryHandler } from "$lib/core/api/services/files/service.svelte";
  import { PATHS } from "$lib/core/api/services/files/hierarchy";
  import { join_path, split_path } from "$lib/core/api/services/files/path";
  import { Button, EmptyState, Spinner } from "../ui";
  import { LockSimple as LockSimpleIcon, WarningCircle as WarningCircleIcon } from "phosphor-svelte";
  import { reconnect } from "./file-actions";
  import FileExplorerNavigation from "./file-explorer-navigation.svelte";
  import FileExplorerPlaces from "./file-explorer-places.svelte";
  import FileList from "./file-list.svelte";
  import FileExplorerStatusBar from "./file-explorer-status-bar.svelte";
  import { report_file_error } from "./file-explorer.errors";
  import { open_latest } from "./file-explorer-history";
  import type { PickerMode } from "./picker";
  import FilePickerFooter from "./file-picker-footer.svelte";

  let { path = PATHS.home, picker }: { path?: string; picker?: PickerMode } = $props();

  let selected = $state<string[]>([]);

  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let handler: DirectoryHandler | null = $state(null);
  /** Folders visited before this one, for Back, as paths: a handler is opened only when the user goes back. */
  let history: string[][] = $state.raw([]);
  /** Folders left by Back, nearest last, for Forward. Navigating anywhere new drops them. */
  let forward: string[][] = $state.raw([]);
  let search = $state("");
  let destroyed = false;
  /** Back and Forward resolve async; a newer navigation wins. */
  let step_id = 0;

  const can_go_back = $derived(history.length > 0);
  // After a reload a mount keeps its handle but not the permission; the browser asks again only from a click.
  const locked_mount = $derived.by(() => {
    const path = handler?.path;
    if (path === undefined) return null;
    return files.mounts.find((mount) => mount.state === MountState.LOCKED && (path === mount.path || path.startsWith(`${mount.path}/`))) ?? null;
  });
  const can_go_forward = $derived(forward.length > 0);

  // The start folder is read once; navigating afterwards is the explorer's own state.
  const init_promise = untrack(() => files.directory(split_path(path))).then(show);

  function show(next: DirectoryHandler) {
    if (destroyed) return next.dispose();
    const previous = handler;
    handler = next;
    search = "";
    selected = [];
    if (previous !== next) previous?.dispose();
  }

  function navigate_to(next: DirectoryHandler) {
    step_id++;
    if (handler) history = [...history, handler.segments];
    forward = [];
    show(next);
  }

  function navigate_path(segments: string[]) {
    files
      .directory(segments)
      .then(navigate_to)
      .catch((error) => report_file_error(`Could not open /${segments.join("/")}`, error));
  }

  async function step(back: boolean) {
    const id = ++step_id;
    const found = await open_latest(files, back ? history : forward);
    if (id !== step_id || destroyed) return found?.next.dispose();
    const left = handler ? [handler.segments] : [];
    if (back) {
      history = found?.rest ?? [];
      if (found) forward = [...forward, ...left];
    } else {
      forward = found?.rest ?? [];
      if (found) history = [...history, ...left];
    }
    if (found) show(found.next);
  }

  const navigate_back = () => void step(true).catch((error) => report_file_error("Could not go back", error));
  const navigate_forward = () => void step(false).catch((error) => report_file_error("Could not go forward", error));

  // The mobile Back button walks this explorer's history first (ADR-003 on_back).
  const { window } = get_app_context();
  $effect(() =>
    window.on_back(() => {
      if (!can_go_back) return false;
      navigate_back();
      return true;
    })
  );

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
  });
</script>

{#await init_promise}
  <div class="grid h-full place-items-center"><Spinner label="Opening folder" /></div>
{:then}
  {#if handler}
    <!-- minmax(0,1fr): the implicit auto column would grow to the toolbar's min-content and push the footer out of a phone-wide sheet. -->
    <div class="grid h-full grid-cols-[minmax(0,1fr)] grid-rows-[auto_1fr_auto] overflow-hidden">
      <FileExplorerNavigation {handler} {can_go_back} {can_go_forward} terminal={!picker} bind:search onback={navigate_back} onforward={navigate_forward} onnavigatepath={navigate_path} />

      <div class="flex min-h-0">
        <FileExplorerPlaces current={handler.path} onnavigatepath={navigate_path} />
        {#if locked_mount}
          {@const mount = locked_mount}
          <div class="min-w-0 flex-1">
            <EmptyState icon={LockSimpleIcon} title="{mount.name} is locked" description="The browser forgets access to folders on your disk between visits. Reconnect to allow it again.">
              {#snippet actions()}<Button variant="primary" onclick={() => reconnect(mount.path)}>Reconnect</Button>{/snippet}
            </EmptyState>
          </div>
        {:else}
          <FileList {handler} bind:search bind:selected {picker} onnavigate={navigate_to} />
        {/if}
      </div>

      {#if picker}
        <FilePickerFooter {handler} {picker} {selected} onnavigatepath={navigate_path} />
      {:else}
        <FileExplorerStatusBar {handler} {files} />
      {/if}
    </div>
  {/if}
{:catch error}
  <EmptyState icon={WarningCircleIcon} tone="error" title="Couldn't open this folder" description={error?.message ?? "Unknown error"} />
{/await}
