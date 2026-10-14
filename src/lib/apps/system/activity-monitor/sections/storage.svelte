<script lang="ts">
  import kernel, { type AppsService, type FilesService } from "$lib/core/api";
  import { Button, Section, Spinner } from "$lib/core/components/ui";
  import { format_bytes, error_message } from "$lib/core/utils";
  import { local_storage_usage, type LocalStorageGroup, type StorageEstimateWithDetails } from "../browser";

  const FOLDERS = ["/home", "/etc", "/var", "/tmp"];

  const files = $derived(kernel.service<FilesService>("files"));
  const apps = $derived(kernel.service<AppsService>("apps"));

  interface Quota {
    estimate: StorageEstimateWithDetails;
    persisted: boolean;
  }

  interface Worker {
    controller: string | null;
    scope: string | null;
    active: string | null;
    waiting: string | null;
    installing: string | null;
  }

  let quota = $state<Promise<Quota>>(load_quota());
  let worker = $state<Promise<Worker>>(load_worker());
  let local = $state.raw<LocalStorageGroup[]>(local_storage_usage());
  let folders = $state<Promise<{ path: string; bytes: number | null }[]> | null>(null);

  const local_total = $derived(local.reduce((sum, group) => sum + group.bytes, 0));

  async function load_quota(): Promise<Quota> {
    const [estimate, persisted] = await Promise.all([navigator.storage.estimate(), navigator.storage.persisted()]);
    return { estimate, persisted };
  }

  async function load_worker(): Promise<Worker> {
    const container = navigator.serviceWorker;
    const registration = await container.getRegistration();
    return {
      controller: container.controller?.state ?? null,
      scope: registration?.scope ?? null,
      active: registration?.active?.state ?? null,
      waiting: registration?.waiting?.state ?? null,
      installing: registration?.installing?.state ?? null,
    };
  }

  // Walks every file under each folder, so it only runs on request.
  function measure_folders() {
    folders = Promise.all(
      FOLDERS.map(async (path) => {
        const handle = await files.get_directory(path);
        return { path, bytes: handle ? await files.get_directory_size(handle) : null };
      })
    );
  }

  function refresh() {
    quota = load_quota();
    worker = load_worker();
    local = local_storage_usage();
  }
</script>

{#snippet row(label: string, value: string, mono = true)}
  <div class="flex items-center justify-between gap-4 px-4 py-2.5">
    <span class="truncate text-ui">{label}</span>
    <span class={mono ? "shrink-0 font-mono text-ui tabular-nums" : "shrink-0 text-ui text-foreground/65"}>{value}</span>
  </div>
{/snippet}

{#snippet loading()}
  <div class="flex justify-center px-4 py-3"><Spinner label="Loading" /></div>
{/snippet}

<Section title="Quota" description="How much this origin stores, of what the browser allows it.">
  {#snippet actions()}
    <Button size="sm" variant="quiet" onclick={refresh}>Refresh</Button>
  {/snippet}
  {#await quota}
    {@render loading()}
  {:then { estimate, persisted }}
    {@const usage = estimate.usage ?? 0}
    {@const total = estimate.quota ?? 0}
    <div class="flex flex-col gap-2 px-4 py-3">
      <div class="flex items-baseline justify-between gap-4">
        <span class="text-ui">Used</span>
        <span class="font-mono text-ui tabular-nums">{format_bytes(usage)} of {format_bytes(total)}</span>
      </div>
      <span class="h-1.5 overflow-hidden rounded-full bg-foreground/12">
        <span class="block h-full rounded-full bg-primary" style:width="{Math.max(total > 0 ? (usage / total) * 100 : 0, 2)}%"></span>
      </span>
    </div>
    {#if estimate.usageDetails}
      {#each Object.entries(estimate.usageDetails) as [kind, bytes] (kind)}
        {@render row(kind, format_bytes(bytes))}
      {/each}
    {/if}
    {@render row("Persistent", persisted ? "Yes, the browser won't evict it" : "No, can be evicted under pressure", false)}
  {:catch error}
    {@render row("Estimate", error_message(error), false)}
  {/await}
</Section>

<Section title="File system" description="Size of each top-level folder. Measuring reads every file, so it runs on request.">
  {#snippet actions()}
    <Button size="sm" variant="quiet" onclick={measure_folders}>{folders ? "Measure again" : "Measure"}</Button>
  {/snippet}
  {#if folders === null}
    {#each FOLDERS as path (path)}
      {@render row(path, "—")}
    {/each}
  {:else}
    {#await folders}
      {@render loading()}
    {:then sizes}
      {#each sizes as { path, bytes } (path)}
        {@render row(path, bytes === null ? "Missing" : format_bytes(bytes))}
      {/each}
    {:catch error}
      {@render row("Couldn't measure the folders", error_message(error), false)}
    {/await}
  {/if}
</Section>

<Section title="App storage" description="localStorage per app, {format_bytes(local_total)} in total.">
  {#if local.length === 0}
    <p class="px-4 py-3 text-ui text-foreground/65">Nothing stored</p>
  {:else}
    {#each local as group (group.app_id)}
      {@const name = group.app_id === null ? "Other keys" : (apps.get(group.app_id)?.name ?? group.app_id)}
      {@render row(`${name} · ${group.keys} ${group.keys === 1 ? "key" : "keys"}`, format_bytes(group.bytes))}
    {/each}
  {/if}
</Section>

<Section title="Service worker" description="The worker that caches the OS for offline use.">
  {#await worker}
    {@render loading()}
  {:then info}
    {@render row("Controlling this page", info.controller ?? "No")}
    {@render row("Scope", info.scope ?? "Not registered")}
    {#if info.scope}
      {@render row("Active", info.active ?? "—")}
      {@render row("Waiting", info.waiting ?? "—")}
      {#if info.installing}{@render row("Installing", info.installing)}{/if}
    {/if}
  {:catch error}
    {@render row("Service worker", error_message(error), false)}
  {/await}
</Section>
