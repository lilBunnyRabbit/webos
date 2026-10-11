<script lang="ts">
  import { Button, Section } from "$lib/core/components/ui";
  import { format_bytes } from "$lib/core/utils";
  import { online } from "svelte/reactivity/window";
  import { format_ms, short_url } from "../browser";
  import type { NetworkMonitor } from "../network-monitor.svelte";

  let { monitor }: { monitor: NetworkMonitor } = $props();

  const connection = $derived(monitor.connection);
</script>

{#snippet row(label: string, value: string)}
  <div class="flex items-center justify-between gap-4 px-4 py-2.5">
    <span class="text-ui">{label}</span>
    <span class="font-mono text-ui tabular-nums">{value}</span>
  </div>
{/snippet}

<Section title="Connection" description="What the browser knows about the network right now.">
  {@render row("Status", online.current === false ? "Offline" : "Online")}
  {#if connection}
    {@render row("Effective type", connection.effective_type ?? "—")}
    {@render row("Downlink", connection.downlink === null ? "—" : `${connection.downlink} Mb/s`)}
    {@render row("Round trip", connection.rtt === null ? "—" : `${connection.rtt} ms`)}
    {#if connection.save_data}{@render row("Data saver", "On")}{/if}
  {:else}
    {@render row("Connection details", "Not available in this browser")}
  {/if}
</Section>

<Section
  title="Requests"
  description="{monitor.entries.length} requests, {format_bytes(monitor.total_bytes)} transferred {monitor.history_included
    ? 'since the page loaded'
    : 'since this window opened'}."
>
  {#snippet actions()}
    {#if !monitor.history_included}
      <Button size="sm" variant="quiet" onclick={() => monitor.include_history()}>Include earlier</Button>
    {/if}
    <Button size="sm" variant="quiet" onclick={() => monitor.clear()}>Clear</Button>
  {/snippet}

  {#if !monitor.resource_supported}
    <p class="px-4 py-3 text-ui text-foreground/65">Not available in this browser</p>
  {:else if monitor.entries.length === 0}
    <p class="px-4 py-3 text-ui text-foreground/65">No requests yet</p>
  {:else}
    <div class="grid h-8 grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-x-3 px-4 text-2xs tracking-wide text-foreground/65 uppercase @lg:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_4.5rem]">
      <span>Resource</span>
      <span class="hidden @lg:block">Type</span>
      <span class="text-right">Size</span>
      <span class="text-right">Time</span>
    </div>
    {#each monitor.entries as entry (entry)}
      <div class="grid h-8 grid-cols-[minmax(0,1fr)_4.5rem_4.5rem] items-center gap-x-3 px-4 font-mono text-2xs tabular-nums @lg:grid-cols-[minmax(0,1fr)_5.5rem_4.5rem_4.5rem]">
        <span class="truncate" title={entry.name}>{short_url(entry.name)}</span>
        <span class="hidden truncate text-foreground/65 @lg:block">{entry.initiatorType}</span>
        <span class="text-right text-foreground/65" title={entry.transferSize === 0 ? "Served from cache, or cross-origin without timing access" : undefined}>
          {entry.transferSize === 0 ? "—" : format_bytes(entry.transferSize)}
        </span>
        <span class="text-right">{format_ms(entry.duration)}</span>
      </div>
    {/each}
  {/if}
</Section>
