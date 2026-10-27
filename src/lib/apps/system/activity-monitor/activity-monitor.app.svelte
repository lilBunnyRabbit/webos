<script lang="ts">
  import kernel, { type DesktopItem, type DesktopService, type WindowId, type WindowsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { SideNav } from "$lib/core/components/ui";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { NetworkMonitor } from "./network-monitor.svelte";
  import { PerformanceMonitor } from "./performance-monitor.svelte";
  import { DomMonitor } from "./dom-monitor.svelte";
  import Network from "./sections/network.svelte";
  import Performance from "./sections/performance.svelte";
  import Storage from "./sections/storage.svelte";
  import Tasks from "./sections/tasks.svelte";
  import Background from "./sections/background.svelte";
  import Widgets from "./sections/widgets.svelte";
  import Windows from "./sections/windows.svelte";
  import { SECTIONS, SECTION_IDS, type Section } from "./sections";

  let { section: requested }: { section?: Section } = $props();

  const { storage, window: win } = get_app_context();
  // svelte-ignore state_referenced_locally
  const section = storage.window<Section>("section", requested ?? "windows", z.enum(SECTION_IDS));
  // svelte-ignore state_referenced_locally
  const open = storage.window<boolean>("open", requested !== undefined, z.boolean());
  const current = $derived(SECTIONS.find((item) => item.value === section.value) ?? SECTIONS[0]);

  const windows = $derived(kernel.service<WindowsService>("windows"));

  const desktop = $derived(kernel.service<DesktopService>("desktop"));
  const widgets = $derived(desktop.items().filter((item): item is Extract<DesktopItem, { kind: "widget" }> => item.kind === "widget"));

  const window_monitor = new DomMonitor<WindowId>(
    () => windows.list(),
    (id) => document.querySelector(`[data-window-id="${CSS.escape(id)}"]`)
  );
  const widget_monitor = new DomMonitor<string>(
    () => widgets.map((item) => item.name),
    (name) =>
      (document.querySelector(`[data-desktop-name="${CSS.escape(name)}"]`)?.parentElement ?? document.querySelector(`[data-home-name="${CSS.escape(name)}"]`))?.querySelector(
        ":scope > [data-widget-body]"
      ) ?? null
  );
  const performance_monitor = new PerformanceMonitor();
  const network_monitor = new NetworkMonitor();

  // Monitors run only while this window exists; everything they start is stopped by these cleanups. `untrack` keeps
  // their first synchronous reads (the window list) from restarting them.
  $effect(() => untrack(() => performance_monitor.observe()));
  $effect(() => untrack(() => network_monitor.observe()));
  // Only the shown section samples: its history starts when it's opened.
  const samplers: Partial<Record<Section, { sample(): () => void }>> = {
    windows: window_monitor,
    widgets: widget_monitor,
    performance: performance_monitor,
  };
  $effect(() => {
    const sampler = win.is_visible ? samplers[section.value] : undefined;
    if (sampler) return untrack(() => sampler.sample());
  });
</script>

<SideNav label="Activity Monitor sections" back_label="Activity Monitor" items={[...SECTIONS]} bind:value={section.value} bind:open={open.value}>
  <main class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
      <h1 class="text-lg font-semibold">{current.label}</h1>
      {#if section.value === "windows"}
        <Windows monitor={window_monitor} />
      {:else if section.value === "widgets"}
        <Widgets monitor={widget_monitor} {widgets} />
      {:else if section.value === "performance"}
        <Performance monitor={performance_monitor} />
      {:else if section.value === "network"}
        <Network monitor={network_monitor} />
      {:else if section.value === "storage"}
        <Storage />
      {:else if section.value === "background"}
        <Background />
      {:else}
        <Tasks />
      {/if}
    </div>
  </main>
</SideNav>
