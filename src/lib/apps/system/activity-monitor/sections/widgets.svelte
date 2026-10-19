<script lang="ts">
  import kernel, { NotificationType, Platform, type AppsService, type DesktopItem, type DesktopService, type NotificationsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { EmptyState, IconButton, Section } from "$lib/core/components/ui";
  import ShortcutIcon from "$lib/core/components/files/shortcut-icon.svelte";
  import { cn, error_message } from "$lib/core/utils";
  import {
    ArrowSquareOut as ArrowSquareOutIcon,
    SquaresFour as SquaresFourIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import { format_rate } from "../browser";
  import { next_sort, type Sort } from "../sort";
  import SortHeader from "./sort-header.svelte";
  import Sparkline from "../sparkline.svelte";
  import type { DomMonitor, DomStats } from "../dom-monitor.svelte";
  import { summarize_props } from "../widget-props";

  type Widget = Extract<DesktopItem, { kind: "widget" }>;

  let { monitor, widgets }: { monitor: DomMonitor<string>; widgets: Widget[] } = $props();

  type SortKey = "name" | "rate" | "nodes";

  const { window: win } = get_app_context();
  const apps = $derived(kernel.service<AppsService>("apps"));
  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let sort = $state<Sort<SortKey> | null>(null);

  interface Row {
    item: Widget;
    app_name: string;
    stats: DomStats | null;
  }

  const rows = $derived.by(() => {
    const list: Row[] = widgets.map((item) => ({
      item,
      app_name: apps.get(item.app_id)?.name ?? item.app_id,
      stats: monitor.stats.get(item.name) ?? null,
    }));
    if (!sort) return list;
    const { key, desc } = sort;
    const value = (row: Row) => (key === "name" ? 0 : (row.stats?.[key] ?? -1));
    list.sort((a, b) => (key === "name" ? a.item.label.localeCompare(b.item.label) : value(a) - value(b)) * (desc ? -1 : 1));
    return list;
  });

  const total_rate = $derived(rows.reduce((sum, row) => sum + (row.stats?.rate ?? 0), 0));

  const onsort = (key: SortKey) => (sort = next_sort(sort, key));

  async function remove(item: Widget) {
    const confirmed = await win.confirm(`Remove the “${item.label}” widget?`, {
      detail: "Only the widget goes; the app and what it shows stay.",
      confirm_label: "Remove",
      danger: true,
    });
    if (!confirmed) return;
    try {
      await desktop.remove_item(item.name);
    } catch (error) {
      notifications.notify("activity-monitor", {
        type: NotificationType.ERROR,
        title: `Could not remove “${item.label}”`,
        message: error_message(error),
      });
    }
  }

  const GRID = "grid items-center gap-x-3 grid-cols-[minmax(0,1fr)_3.5rem_4rem] @md:grid-cols-[minmax(0,1fr)_3rem_3.5rem_4rem] @xl:grid-cols-[minmax(0,1fr)_minmax(0,9rem)_3rem_3.5rem_3.5rem_4rem] @2xl:grid-cols-[minmax(0,1fr)_minmax(0,8rem)_3rem_5rem_3.5rem_3.5rem_4rem]";
</script>

<Section title={kernel.platform === Platform.MOBILE ? "Home screen widgets" : "Desktop widgets"} description="DOM activity per widget, sampled every second while Activity Monitor is visible.">
  {#if rows.length === 0}
    <EmptyState
      icon={SquaresFourIcon}
      title="No widgets"
      description={kernel.platform === Platform.MOBILE ? "Hold the home screen, then Add widget." : "Pin one from an app's menu or the desktop's right-click menu."}
    />
  {:else}
    <div class="@container divide-y divide-foreground/8">
      <div class={cn(GRID, "h-8 px-3 text-2xs tracking-wide text-foreground/65 uppercase")}>
        <SortHeader label="Widget" key="name" {sort} {onsort} />
        <span class="hidden @xl:block">Props</span>
        <span class="hidden text-right @md:block">Size</span>
        <span class="hidden @2xl:block">Activity</span>
        <SortHeader label="Mut/s" key="rate" {sort} {onsort} />
        <SortHeader label="Nodes" key="nodes" {sort} {onsort} class="hidden @xl:flex" />
        <span></span>
      </div>

      {#each rows as row (row.item.name)}
        {@const props_summary = summarize_props(row.item.props)}
        <div class={cn(GRID, "h-10 px-3 text-ui")}>
          <div class="flex min-w-0 items-center gap-2" title="{row.item.label} · {row.app_name} · {row.item.name}">
            <ShortcutIcon app_id={row.item.app_id} badge={false} class="size-4 text-foreground/70" />
            <span class="truncate">{row.item.label}</span>
            {#if row.app_name !== row.item.label}<span class="hidden shrink-0 text-2xs text-foreground/65 @md:inline">{row.app_name}</span>{/if}
          </div>

          <span class="hidden truncate font-mono text-2xs text-foreground/65 @xl:block" title={props_summary}>{props_summary}</span>
          <span class="hidden text-right font-mono text-2xs text-foreground/65 tabular-nums @md:block">{row.item.size.w}×{row.item.size.h}</span>

          <div class="hidden @2xl:block">
            <Sparkline values={row.stats?.history ?? []} label="Mutations per second, last minute" class="h-6" />
          </div>

          <span class="text-right font-mono text-2xs tabular-nums">{row.stats ? format_rate(row.stats.rate) : "—"}</span>
          <span class="hidden text-right font-mono text-2xs text-foreground/65 tabular-nums @xl:block">{row.stats?.nodes ?? "—"}</span>

          <div class="flex justify-end">
            <IconButton size="sm" label="Open {row.app_name}" onclick={() => desktop.open(row.item)}>
              <ArrowSquareOutIcon />
            </IconButton>
            <IconButton size="sm" label="Remove from desktop" onclick={() => remove(row.item)}>
              <TrashIcon />
            </IconButton>
          </div>
        </div>
      {/each}

      <p class="px-3 py-2 text-right font-mono text-2xs text-foreground/65 tabular-nums">
        {rows.length} {rows.length === 1 ? "widget" : "widgets"} · {format_rate(total_rate)} mutations/s
      </p>
    </div>
  {/if}
</Section>
