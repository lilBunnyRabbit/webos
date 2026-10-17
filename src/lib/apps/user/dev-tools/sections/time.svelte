<script lang="ts">
  import { Badge, Button, CopyButton, Input, Section, Select } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import { ClockClockwise as ClockClockwiseIcon } from "phosphor-svelte";
  import { TimeUnit, all_zones, is_zone, local_zone, parse_time, time_rows } from "../time";
  import type { DevToolsState } from "../tools";

  let { value = $bindable() }: { value: DevToolsState["time"] } = $props();

  const { window: win } = get_app_context();
  const clock = new Ticker(() => win.is_visible, 1000);

  const UNIT_LABELS: Record<TimeUnit, string> = {
    [TimeUnit.SECONDS]: "Unix seconds",
    [TimeUnit.MILLISECONDS]: "Unix milliseconds",
    [TimeUnit.MICROSECONDS]: "Unix microseconds",
    [TimeUnit.NANOSECONDS]: "Unix nanoseconds",
    [TimeUnit.DATE]: "Date",
    [TimeUnit.NOW]: "Now, live",
  };

  const here = local_zone();
  const zone_options = [{ value: "", label: `Local · ${here}` }, ...all_zones().map((zone) => ({ value: zone, label: zone.replaceAll("_", " ") }))];
  const zone = $derived(value.zone !== "" && is_zone(value.zone) ? value.zone : here);

  const now = $derived(clock.now);
  const parsed = $derived(parse_time(value.input, now));
  const rows = $derived(parsed.ok ? time_rows(parsed.ms, zone, now) : []);

  function use_now() {
    value.input = String(Math.floor(Date.now() / 1000));
  }
</script>

<Section title="Timestamp or date" flush>
  <div class="flex flex-wrap items-center gap-2">
    <Input
      bind:value={value.input}
      aria-label="Timestamp or date"
      placeholder="1700000000, 2026-10-17T12:00Z, or empty for now"
      class="min-w-0 flex-1 basis-64 font-mono"
    />
    <Button size="md" onclick={use_now}><ClockClockwiseIcon weight="bold" />Now</Button>
  </div>
  <div class="flex flex-wrap items-center gap-2">
    {#if parsed.ok}
      <Badge tone="primary">{UNIT_LABELS[parsed.unit]}</Badge>
    {/if}
    <span class="text-ui text-foreground/65">Bare numbers are read by size: seconds, then ms, µs and ns.</span>
  </div>
  {#if !parsed.ok}
    <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">{parsed.error}</p>
  {/if}
</Section>

<Section title="Converted" flush>
  {#snippet actions()}
    <Select size="sm" options={zone_options} bind:value={value.zone} aria-label="Time zone" class="w-52 max-w-full" />
  {/snippet}
  {#if parsed.ok}
    <dl class="divide-y divide-foreground/8 rounded-xl bg-background-light ring-1 ring-foreground/8">
      {#each rows as row (row.label)}
        <div class="flex items-center gap-3 px-3 py-1.5">
          <dt class="w-28 shrink-0 truncate text-ui text-foreground/65" title={row.label}>{row.label}</dt>
          <dd class="min-w-0 flex-1 font-mono text-2xs break-all">{row.value}</dd>
          <CopyButton text={row.value} label="Copy {row.label}" />
        </div>
      {/each}
    </dl>
  {/if}
</Section>
