<script lang="ts">
  import kernel, { WindowFlag, type WindowId, type WindowsService } from "$lib/core/api";
  import type { Component } from "svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Badge, Button, EmptyState, Section } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import {
    AppWindow as AppWindowIcon,
    Browser as BrowserIcon,
    CaretDown as CaretDownIcon,
    CaretUp as CaretUpIcon,
    Play as PlayIcon,
    Rectangle as RectangleIcon,
    SpeakerHigh as SpeakerHighIcon,
  } from "phosphor-svelte";
  import Sparkline from "../sparkline.svelte";
  import type { DomMonitor, DomStats } from "../dom-monitor.svelte";

  let { monitor }: { monitor: DomMonitor<WindowId> } = $props();

  type SortKey = "name" | "rate" | "peak" | "nodes";

  const { window_id: own_id } = get_app_context();
  const windows = $derived(kernel.service<WindowsService>("windows"));

  let sort = $state<{ key: SortKey; desc: boolean } | null>(null);

  interface Row {
    id: WindowId;
    name: string;
    icon: Component;
    minimized: boolean;
    stats: DomStats | null;
  }

  const rows_source = $derived(
    windows.list().flatMap((id) => {
      const instance = windows.get(id);
      if (!instance) return [];
      return [{ id, name: instance.title ?? instance.app.manifest.name, icon: instance.app.manifest.icon, minimized: instance.flags.has(WindowFlag.MINIMIZED) }];
    })
  );

  const rows = $derived.by(() => {
    const list: Row[] = rows_source.map((row) => ({ ...row, stats: monitor.stats.get(row.id) ?? null }));
    if (!sort) return list;
    const { key, desc } = sort;
    const value = (row: Row) => (key === "name" ? 0 : (row.stats?.[key] ?? -1));
    list.sort((a, b) => (key === "name" ? a.name.localeCompare(b.name) : value(a) - value(b)) * (desc ? -1 : 1));
    return list;
  });

  const total_rate = $derived(rows.reduce((sum, row) => sum + (row.stats?.rate ?? 0), 0));

  function toggle_sort(key: SortKey) {
    sort = sort?.key === key ? { key, desc: !sort.desc } : { key, desc: key !== "name" };
  }

  function format_rate(rate: number): string {
    return rate < 10 ? rate.toFixed(1) : Math.round(rate).toString();
  }

  // Breakpoints measure the table (its own @container), not the window: the section is capped at max-w-3xl.
  const GRID = "grid items-center gap-x-3 grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] @md:grid-cols-[minmax(0,1fr)_4rem_4rem_3.5rem] @xl:grid-cols-[minmax(0,1fr)_4rem_4rem_4rem_4.5rem_3.5rem] @2xl:grid-cols-[minmax(0,1fr)_5rem_4rem_4rem_4rem_4.5rem_3.5rem]";
</script>

{#snippet header(label: string, key: SortKey | null, class_name = "")}
  {#if key}
    {@const active = sort?.key === key}
    <button
      class={cn("flex items-center gap-1 tracking-wide uppercase hover:text-foreground", key !== "name" && "justify-end", active && "text-foreground", class_name)}
      onclick={() => toggle_sort(key)}
    >
      {label}
      {#if active}
        {#if sort?.desc}<CaretDownIcon class="size-3" weight="bold" />{:else}<CaretUpIcon class="size-3" weight="bold" />{/if}
      {/if}
    </button>
  {:else}
    <span class={class_name}>{label}</span>
  {/if}
{/snippet}

<Section
  title="Open windows"
  description="DOM activity per window, sampled every second while Activity Monitor is visible."
>
  {#if rows.length === 0}
    <EmptyState icon={AppWindowIcon} title="No windows" />
  {:else}
    <div class="@container divide-y divide-foreground/8">
      <div class={cn(GRID, "h-8 px-3 text-2xs tracking-wide text-foreground/65 uppercase")}>
        {@render header("Window", "name")}
        {@render header("Activity", null, "hidden @2xl:block")}
        {@render header("Mut/s", "rate")}
        {@render header("Peak", "peak", "hidden @xl:flex")}
        {@render header("Nodes", "nodes", "hidden @md:flex")}
        {@render header("Media", null, "hidden text-right @xl:block")}
        <span></span>
      </div>

      {#each rows as row (row.id)}
        {@const own = row.id === own_id}
        <div class={cn(GRID, "h-10 px-3 text-ui")}>
          <div class="flex min-w-0 items-center gap-2">
            <row.icon class="size-4 shrink-0 text-foreground/70" weight="duotone" />
            <span class="truncate" title="{row.name} · {row.id}">{row.name}</span>
            {#if own}<Badge tone="primary" class="shrink-0">this</Badge>{/if}
            {#if row.minimized}<Badge class="shrink-0">minimized</Badge>{/if}
          </div>

          <div class="hidden @2xl:block">
            <Sparkline values={row.stats?.history ?? []} label="Mutations per second, last minute" class="h-6" />
          </div>

          {#if row.stats}
            {@const stats = row.stats}
            <span class="text-right font-mono text-2xs tabular-nums">{format_rate(stats.rate)}</span>
            <span class="hidden text-right font-mono text-2xs text-foreground/65 tabular-nums @xl:block">{format_rate(stats.peak)}</span>
            <span class="hidden text-right font-mono text-2xs text-foreground/65 tabular-nums @md:block">{stats.nodes}</span>
            <span
              class="hidden items-center justify-end gap-2 font-mono text-2xs text-foreground/65 tabular-nums @xl:flex"
              title="{stats.canvases} canvas, {stats.media_playing} of {stats.media} media playing, {stats.iframes} iframes"
            >
              {#if stats.canvases + stats.media + stats.iframes === 0}
                —
              {:else}
                {#if stats.canvases}<span class="flex items-center gap-0.5"><RectangleIcon class="size-3" />{stats.canvases}</span>{/if}
                {#if stats.media}
                  <span class={cn("flex items-center gap-0.5", stats.media_playing && "text-primary")}>
                    {#if stats.media_playing}<PlayIcon class="size-3" weight="fill" />{:else}<SpeakerHighIcon class="size-3" />{/if}
                    {stats.media_playing || stats.media}
                  </span>
                {/if}
                {#if stats.iframes}<span class="flex items-center gap-0.5"><BrowserIcon class="size-3" />{stats.iframes}</span>{/if}
              {/if}
            </span>
          {:else}
            <span class="text-right font-mono text-2xs text-foreground/65">—</span>
            <span class="hidden text-right font-mono text-2xs text-foreground/65 @xl:block">—</span>
            <span class="hidden text-right font-mono text-2xs text-foreground/65 @md:block">—</span>
            <span class="hidden text-right font-mono text-2xs text-foreground/65 @xl:block">—</span>
          {/if}

          <Button size="sm" variant="quiet" class="justify-self-end" onclick={() => windows.force_close(row.id)}>End</Button>
        </div>
      {/each}

      <p class="px-3 py-2 text-right font-mono text-2xs text-foreground/65 tabular-nums">
        {rows.length} windows · {format_rate(total_rate)} mutations/s
      </p>
    </div>
  {/if}
</Section>
