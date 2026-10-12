<script lang="ts">
  import { Badge, Section } from "$lib/core/components/ui";
  import { format_bytes } from "$lib/core/utils";
  import type { Snippet } from "svelte";
  import { format_ms, short_url, top_script, type PressureState } from "../browser";
  import type { PerformanceMonitor } from "../performance-monitor.svelte";
  import Sparkline from "../sparkline.svelte";

  let { monitor }: { monitor: PerformanceMonitor } = $props();

  const PRESSURE_TONE: Record<PressureState, "success" | "info" | "warning" | "error"> = {
    nominal: "success",
    fair: "info",
    serious: "warning",
    critical: "error",
  };

  const fps = $derived(monitor.fps.last);
  const lag = $derived(monitor.lag.last);
  const recent_frames = $derived(monitor.frames.filter((frame) => monitor.now - frame.startTime < 60_000).length);
</script>

{#snippet metric(label: string, description: string, value: Snippet, chart?: Snippet)}
  <div class="flex items-center gap-4 px-4 py-3">
    <div class="min-w-0 flex-1">
      <p class="text-ui font-medium">{label}</p>
      <p class="text-2xs text-foreground/65">{description}</p>
    </div>
    {#if chart}<div class="hidden w-40 @lg:block">{@render chart()}</div>{/if}
    <div class="w-28 text-right font-mono text-ui tabular-nums">{@render value()}</div>
  </div>
{/snippet}

{#snippet unavailable()}
  <span class="font-sans text-2xs text-foreground/65">Not available in this browser</span>
{/snippet}

{#snippet fps_value()}{fps === null ? "—" : Math.round(fps)}{/snippet}
{#snippet fps_chart()}<Sparkline values={monitor.fps.values} max={60} label="Frames per second, last minute" />{/snippet}
{#snippet lag_value()}{lag === null ? "—" : format_ms(lag)}{/snippet}
{#snippet lag_chart()}<Sparkline values={monitor.lag.values} max={50} label="Event loop lag, last minute" />{/snippet}
{#snippet heap_value()}
  {#if monitor.memory_supported}
    {monitor.memory ? format_bytes(monitor.memory.usedJSHeapSize) : "—"}
  {:else}
    {@render unavailable()}
  {/if}
{/snippet}
{#snippet heap_chart()}
  {#if monitor.memory_supported}
    <Sparkline values={monitor.heap.values} max={monitor.memory?.totalJSHeapSize} label="JS heap used, last minute" />
  {/if}
{/snippet}
{#snippet pressure_value()}
  {#if monitor.pressure.kind === "unsupported"}
    {@render unavailable()}
  {:else if monitor.pressure.kind === "error"}
    <span class="font-sans text-2xs text-foreground/65" title={monitor.pressure.message}>Not allowed here</span>
  {:else if monitor.pressure.kind === "ok" && monitor.pressure.state}
    <Badge tone={PRESSURE_TONE[monitor.pressure.state]}>{monitor.pressure.state}</Badge>
  {:else}
    —
  {/if}
{/snippet}

<Section title="Main thread" description="Sampled every second while Activity Monitor is visible; the last minute is kept.">
  {@render metric("Frame rate", "Frames per second from requestAnimationFrame", fps_value, fps_chart)}
  {@render metric("Event loop lag", "How late a 1 s timer fires", lag_value, lag_chart)}
  {@render metric(
    "JS heap",
    monitor.memory
      ? `${format_bytes(monitor.memory.totalJSHeapSize)} allocated, limit ${format_bytes(monitor.memory.jsHeapSizeLimit)}`
      : "Used JavaScript heap (performance.memory)",
    heap_value,
    heap_chart
  )}
  {@render metric("CPU pressure", "The system's CPU load as the browser reports it", pressure_value)}
</Section>

<Section
  title="Long animation frames"
  description={monitor.loaf_supported
    ? `Frames over 50 ms since this window opened. ${recent_frames} in the last minute.`
    : "Frames over 50 ms since this window opened."}
>
  {#if !monitor.loaf_supported}
    <p class="px-4 py-3 text-ui text-foreground/65">Not available in this browser</p>
  {:else if monitor.frames.length === 0}
    <p class="px-4 py-3 text-ui text-foreground/65">No long frames yet</p>
  {:else}
    <div class="grid h-8 grid-cols-[3.5rem_4rem_minmax(0,1fr)] items-center gap-x-3 px-4 text-2xs tracking-wide text-foreground/65 uppercase @md:grid-cols-[3.5rem_4.5rem_4.5rem_minmax(0,1fr)]">
      <span class="text-right">When</span>
      <span class="text-right">Duration</span>
      <span class="hidden text-right @md:block">Blocking</span>
      <span>Top script</span>
    </div>
    {#each monitor.frames as frame (frame)}
      {@const script = top_script(frame)}
      <div class="grid h-8 grid-cols-[3.5rem_4rem_minmax(0,1fr)] items-center gap-x-3 px-4 font-mono text-2xs tabular-nums @md:grid-cols-[3.5rem_4.5rem_4.5rem_minmax(0,1fr)]">
        <span class="text-right text-foreground/65">{Math.max(0, Math.round((monitor.now - frame.startTime) / 1000))} s ago</span>
        <span class="text-right">{format_ms(frame.duration)}</span>
        <span class="hidden text-right @md:block">{format_ms(frame.blockingDuration)}</span>
        {#if script}
          <span class="truncate text-foreground/80" title={`${script.invoker}\n${script.sourceURL}`}>
            {script.invoker || script.sourceFunctionName || "anonymous"}
            {#if script.sourceURL}<span class="text-foreground/65"> · {short_url(script.sourceURL)}</span>{/if}
          </span>
        {:else}
          <span class="text-foreground/65">No script attribution (rendering)</span>
        {/if}
      </div>
    {/each}
  {/if}
</Section>
