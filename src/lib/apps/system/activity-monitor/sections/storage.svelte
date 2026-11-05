<script lang="ts">
  import kernel, { type AppsService, type FilesService, type SizeNode } from "$lib/core/api";
  import { Button, Section, Spinner } from "$lib/core/components/ui";
  import { format_bytes, error_message } from "$lib/core/utils";
  import { untrack } from "svelte";
  import { local_storage_size, type StorageEstimateWithDetails } from "../browser";
  import DiskUsage from "./disk-usage.svelte";

  const APP_DATA_PATH = "/var/lib/apps";

  const apps = $derived(kernel.service<AppsService>("apps"));
  const files = $derived(kernel.service<FilesService>("files"));

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
  let local = $state.raw(local_storage_size());
  let app_data = $state.raw<SizeNode[] | null>(null);
  let app_data_error = $state<string | null>(null);

  const app_data_total = $derived((app_data ?? []).reduce((sum, node) => sum + node.size, 0));

  let app_data_load = 0;
  // Depth 2, so app folders come back with `children` and the service's own files at this level can be told apart.
  async function load_app_data() {
    const id = ++app_data_load;
    try {
      const tree = await files.size_tree(APP_DATA_PATH, 2);
      if (id !== app_data_load) return;
      app_data = (tree.children ?? []).filter((node) => node.children);
      app_data_error = null;
    } catch (error) {
      if (id === app_data_load) app_data_error = error_message(error);
    }
  }

  $effect(() => {
    files.revision(APP_DATA_PATH);
    untrack(() => void load_app_data());
  });

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

  function refresh() {
    quota = load_quota();
    worker = load_worker();
    local = local_storage_size();
    void load_app_data();
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

<DiskUsage />

<Section title="App data" description="Each app's folder in {APP_DATA_PATH}, {format_bytes(app_data_total)} in total.">
  {#if app_data_error}
    {@render row("App data", app_data_error, false)}
  {:else if app_data === null}
    {@render loading()}
  {:else if app_data.length === 0}
    <p class="px-4 py-3 text-ui text-foreground/65">Nothing stored</p>
  {:else}
    {#each app_data as node (node.path)}
      {@const count = node.children?.length ?? 0}
      {@render row(`${apps.get(node.name)?.name ?? node.name} · ${count} ${count === 1 ? "file" : "files"}`, format_bytes(node.size))}
    {/each}
  {/if}
  {@render row(`localStorage · ${local.keys} ${local.keys === 1 ? "key" : "keys"}`, format_bytes(local.bytes))}
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
