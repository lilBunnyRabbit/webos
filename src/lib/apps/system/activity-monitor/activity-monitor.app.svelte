<script lang="ts">
  import kernel, { type WindowsService } from "$lib/core/api";
  import { get_app_context } from "$lib/core/contexts/app";
  import { SideNav } from "$lib/core/components/ui";
  import {
    AppWindow as AppWindowIcon,
    Gauge as GaugeIcon,
    HardDrives as HardDrivesIcon,
    WifiHigh as WifiHighIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { z } from "zod";
  import { NetworkMonitor } from "./network-monitor.svelte";
  import { PerformanceMonitor } from "./performance-monitor.svelte";
  import { WindowMonitor } from "./window-monitor.svelte";
  import Network from "./sections/network.svelte";
  import Performance from "./sections/performance.svelte";
  import Storage from "./sections/storage.svelte";
  import Windows from "./sections/windows.svelte";

  const SECTIONS = [
    { value: "windows", label: "Windows", icon: AppWindowIcon },
    { value: "performance", label: "Performance", icon: GaugeIcon },
    { value: "network", label: "Network", icon: WifiHighIcon },
    { value: "storage", label: "Storage", icon: HardDrivesIcon },
  ] as const;
  type Section = (typeof SECTIONS)[number]["value"];

  const { storage, window: win } = get_app_context();
  const section = storage.persisted<Section>("section", "windows", z.enum(SECTIONS.map((item) => item.value)));
  const current = $derived(SECTIONS.find((item) => item.value === section.value) ?? SECTIONS[0]);

  const windows = $derived(kernel.service<WindowsService>("windows"));

  const window_monitor = new WindowMonitor(() => windows.list());
  const performance_monitor = new PerformanceMonitor();
  const network_monitor = new NetworkMonitor();

  // Monitors run only while this window exists; everything they start is stopped by these cleanups. `untrack` keeps
  // their first synchronous reads (the window list) from restarting them.
  $effect(() => untrack(() => performance_monitor.observe()));
  $effect(() => untrack(() => network_monitor.observe()));
  $effect(() => {
    if (win.is_minimized) return;
    const stop_windows = untrack(() => window_monitor.sample());
    const stop_performance = untrack(() => performance_monitor.sample());
    return () => {
      stop_windows();
      stop_performance();
    };
  });
</script>

<div class="flex h-full flex-col @2xl:flex-row">
  <SideNav label="Activity Monitor sections" items={[...SECTIONS]} bind:value={section.value} />

  <main class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-6">
      <h1 class="text-lg font-semibold">{current.label}</h1>
      {#if section.value === "windows"}
        <Windows monitor={window_monitor} />
      {:else if section.value === "performance"}
        <Performance monitor={performance_monitor} />
      {:else if section.value === "network"}
        <Network monitor={network_monitor} />
      {:else}
        <Storage />
      {/if}
    </div>
  </main>
</div>
